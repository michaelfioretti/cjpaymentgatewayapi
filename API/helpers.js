// Stellar
const StellarSdk = require('stellar-sdk');
const server = new StellarSdk.Server('https://horizon.stellar.org');
StellarSdk.Network.usePublicNetwork();
const StellarHDWallet = require('stellar-hd-wallet')
const CJAsset = new StellarSdk.Asset(config.cjAssetCode, config.cjIssuer)

const math = require('mathjs')
const CryptoJS = require('crypto-js')
const axios = require('axios')

// Database
const Mongo = require('mongodb')
const MongoClient = require('mongodb').MongoClient;
const dbUrl = config.dburls[config.env];
const dbName = 'cjpaymentgateway';

const requiredFields = {
    '/api/signup': ['email', 'password', 'name'],
    '/api/login': ['email', 'password'],
    '/api/invoice': ['total', 'lineItems', 'clientName', 'clientAddress', 'details', 'password']
}

module.exports = {
    connectToDb: () => {
        MongoClient.connect(dbUrl, {
            useNewUrlParser: true
        }, function(err, client) {
            if (err) {
                console.log("error connecting to db: ", err)
            }

            db = client.db(dbName);
        });
    },
    checkRequiredFields: (type, data) => {
        if (!requiredFields[type]) return null

        let required = []

        requiredFields[type].forEach(key => {
            if (Object.keys(data).indexOf(key) === -1) {
                required.push(key)
            }
        })

        return (!required.length) ? null : required
    },
    encrypt: (string, secret) => {
        return new Promise((resolve, reject) => {
            var ciphertext = CryptoJS.AES.encrypt(string, secret);
            return resolve(ciphertext.toString());
        });
    },
    decrypt: (ciphertext, secret) => {
        let self = this;
        return new Promise((resolve, reject) => {
            var bytes = CryptoJS.AES.decrypt(ciphertext, secret);
            var decrypted = bytes.toString(CryptoJS.enc.Utf8);
            return resolve(decrypted);
        });
    },
    getUserByField: (q, field) => {
        return new Promise((resolve, reject) => {
            let data = {}
            data[field] = q

            db.collection('vendors').findOne(data, function(err, doc) {
                return resolve(doc)
            });
        })
    },
    getVendorInvoices: (ids) => {
        return new Promise(async(resolve, reject) => {
            db.collection('invoices').find({
                '_id': {
                    '$in': ids
                }
            }).toArray(function(err, invoices) {
                return resolve(invoices)
            })
        })
    },
    getPriceOfCjs: () => {
        let cjId = config.coinMarketCap.cjId

        return new Promise(async(resolve, reject) => {
            let marketData = await axios('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?id=' + cjId, {
                headers: {
                    'X-CMC_PRO_API_KEY': config.coinMarketCap.apiKey
                }
            })

            return resolve(marketData.data.data[cjId].quote.USD.price)
        })
    },
    startInvoiceWatchCron: () => {
        setInterval(Helpers.checkForUnfilledInvoices, 7 * 1000)
    },
    checkForUnfilledInvoices: async() => {
        db.collection('invoices').find({
            'status': {
                $ne: 'filled'
            }
        }).toArray(function(err, invoices) {
            invoices.forEach(async i => {
                let txsForAccount = await server.payments()
                    .forAccount(i.paymentAddress)
                    .call()
                    .catch(function(e) {
                        return console.log(i.paymentAddress + "needs funding...")
                    })

                if (txsForAccount) {
                    let lastTx = txsForAccount.records[txsForAccount.records.length - 1]
                    console.log("# txs: ", txsForAccount.records.length)
                    console.log("checked at " + new Date().toLocaleString())

                    Helpers.checkInvoiceForPayment(lastTx, i)
                }
            })
        })
    },
    checkInvoiceForPayment: (tx, invoice) => {
    	if(!invoice.cjTotal || tx.amount) return
    	let invoiceTotal = math.round(invoice.cjTotal, 8)
    	let paidAmount = math.round(tx.amount, 8)

        if (tx.type === 'payment' && tx.asset_code === 'CJS' && paidAmount === invoiceTotal) {
            console.log("invoice has been paid! Updating...")

            Helpers.sendInvoicePaymentToVendor(invoice, tx.amount)

            db.collection("invoices").updateOne({
                '_id': new Mongo.ObjectID(invoice._id)
            }, {
                $set: {
                    status: "filled"
                }
            }, async function(err, updateResponse) {
                if (!err) {
                    console.log('updated')
                }
            });
        }
    },
    sendInvoicePaymentToVendor: async(invoice, amount) => {
        console.log("sending payment to vendor")
        // Send balance of the invoice to the vendor
        let decryptedSecret = await Helpers.decrypt(invoice.encryptedPaymentAddressSecret, config.encryptionKey)
        let sourceKeypair = StellarSdk.Keypair.fromSecret(decryptedSecret);
        let sourcePublicKey = sourceKeypair.publicKey();
        let accountFromStellar = await server.loadAccount(sourcePublicKey)

        let transaction = new StellarSdk.TransactionBuilder(accountFromStellar).addOperation(StellarSdk.Operation.payment({
                destination: invoice.vendorAddress,
                asset: CJAsset,
                amount: amount
            }))
            .build();

        transaction.sign(sourceKeypair);

        let transactionResult = await server.submitTransaction(transaction)
            .catch(e => {
                return console.log(e.response.data.extras)
            })

        console.log("tx sent to vendor for invoice " + invoice._id)
    }
}


/*
Uncomment if you want to set up trustline for a payment address
 

console.log("give me 10 seconds...")
setTimeout(async function() {
    let secret = await Helpers.decrypt("U2FsdGVkX18vlJvpbW/Ojh+r2rXf+BVtevqq2rt6OX/tbgqQvapuez7YhW1d7y0lgVN+faSyP8BVkjafBP8UPjeVjgo65IsLyAF8IHv2i7w=", config.encryptionKey)
    let accountFromStellar = await server.loadAccount("GCDBXTCH5QQOQ7ZHHRV4BYF7SVJHVSURUABJOT25HP5KX2Z2LGL3O4Z4")
    let keypair = StellarSdk.Keypair.fromSecret(secret);

    var transaction = new StellarSdk.TransactionBuilder(accountFromStellar)
        .addOperation(StellarSdk.Operation.changeTrust({
            asset: CJAsset
        }))
        .build();

    transaction.sign(keypair);

    let transactionResult = await server.submitTransaction(transaction)
        .catch(e => {
            console.log("there was an error setting up trustline for account " + uid)
            console.log("error: ", e)
        })
    console.log("trustline set up")
}, 10000)

*/