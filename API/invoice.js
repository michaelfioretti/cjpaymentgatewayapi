const math = require('mathjs')
const QRCode = require('qrcode')
const MongoClient = require('mongodb')
const StellarHDWallet = require('stellar-hd-wallet')

module.exports = {
    create: async(req, res) => {
        // Get vendor and wallet
        let vendorId = new MongoClient.ObjectID(req.body.vendorId)
        let vendor = await Helpers.getUserByField(vendorId, '_id')
        let index = vendor.invoiceIds.length + 1

        let decrypted = await Helpers.decrypt(vendor.wallet.mnemonic, req.body.password)
        if (!decrypted) {
            return res.status(401).send({
                error: "Password incorrect"
            })
        }

        const wallet = StellarHDWallet.fromMnemonic(decrypted)
        const paymentAddress = wallet.getPublicKey(index)
        const encryptedPaymentAddressSecret = await Helpers.encrypt(wallet.getSecret(index), config.encryptionKey)
        const qrCodeUrl = await QRCode.toDataURL(paymentAddress)

        // Save the invoice and return it
        let invoice = {
            total: req.body.total,
            clientName: req.body.clientName,
            lineItems: req.body.lineItems,
            clientAddress: req.body.clientAddress,
            details: req.body.details,
            paymentAddress: paymentAddress,
            paymentAddressQrCodeUrl: qrCodeUrl,
            status: 'unfilled',
            paymentIndex: index,
            encryptedPaymentAddressSecret: encryptedPaymentAddressSecret,
            vendorAddress: wallet.getPublicKey(0)
        }

        //@TODO: Remove when we are ready
        invoice.paymentAddress = "GCDBXTCH5QQOQ7ZHHRV4BYF7SVJHVSURUABJOT25HP5KX2Z2LGL3O4Z4"
        invoice.encryptedPaymentAddressSecret = "U2FsdGVkX18vlJvpbW/Ojh+r2rXf+BVtevqq2rt6OX/tbgqQvapuez7YhW1d7y0lgVN+faSyP8BVkjafBP8UPjeVjgo65IsLyAF8IHv2i7w="

        // Save the invoice and update the vendor with their invoice
        db.collection('invoices').insertOne(invoice, function(err, result) {
            if (err) {
                console.log("error saving invoice: ", error)
                return res.status(500).send({
                    error: err,
                    message: "There was an error saving your invoice. Please try again"
                })
            }

            vendor.invoiceIds.push(result.insertedId)

            db.collection("vendors").updateOne({
                '_id': vendorId
            }, {
                $set: {
                    invoiceIds: vendor.invoiceIds
                }
            }, function(err, updateResponse) {
                if (err) {
                    console.log("error saving invoice ids to vendor: ", err)
                    return res.status(500).send({
                        error: err,
                        message: "There was an error. Please try again"
                    })
                }

                return res.status(200).send({
                    message: "Invoice saved successfully",
                    invoice: invoice
                })
            });
        });
    },
    get: (req, res) => {
    	let id

    	try{
    		id = new MongoClient.ObjectID(req.params.id)
    	} catch(e) {
    		return res.status(500).send({
    			error: "Ill-formed invoice ID"
    		})
    	}

        db.collection('invoices').findOne({
            '_id': new MongoClient.ObjectID(req.params.id)
        }, async function(err, doc) {
            if (!doc) {
                return res.status(404).send({
                    message: "Invoice with id '" + req.params.id + "' not found"
                })
            }

            const cjPrice = await Helpers.getPriceOfCjs()
            const amountInCjs = math.eval(doc.total / cjPrice).toFixed(6)
            
            doc.cjTotal = amountInCjs

            return res.status(200).send({
                invoice: doc
            })
        });
    },
    getStatus: (req, res) => {
        db.collection('invoices').findOne({
            '_id': new MongoClient.ObjectID(req.params.id)
        }, function(err, doc) {
            return res.status(200).send({
                status: doc.status
            })
        });
    }
}