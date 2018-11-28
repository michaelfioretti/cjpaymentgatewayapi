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
            date: new Date().toISOString(),
            vendorId: vendorId,
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
            vendorAddress: wallet.getPublicKey(0),
            type: 'invoice'
        }

        //@TODO: Remove when we are ready
        invoice.paymentAddress = "GDQC7OZZPSQFQO2MOLWHBSVJ6MCEWUJ7UY6KXVQYSUVKQLIIA54TQ2PC"
        invoice.encryptedPaymentAddressSecret = "U2FsdGVkX1/G4n2uaOM0GcGvH2V1JqSeoYwnMXxVnznPNgeHyx3ggkw8Jy4gh1od4bT4HIa0lHXKtNuktaokdAop/RP1oIhL0JSkEZE5nRo="

        // Save the invoice and update the vendor with their invoice
        db.collection('txs').insertOne(invoice, function(err, result) {
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

        try {
            id = new MongoClient.ObjectID(req.params.id)
        } catch (e) {
            return res.status(500).send({
                error: "Ill-formed invoice ID"
            })
        }

        db.collection('txs').findOne({
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

            db.collection("txs").updateOne({
                '_id': new MongoClient.ObjectID(req.params.id)
            }, {
                $set: {
                    cjTotal: amountInCjs
                }
            }, function(err, updateResponse) {
                if (err) {
                    console.log("error saving invoice: ", err)
                }
            });

            return res.status(200).send({
                invoice: doc
            })
        });
    },
    getStatus: (req, res) => {
        db.collection('txs').findOne({
            '_id': new MongoClient.ObjectID(req.params.id)
        }, function(err, doc) {
            if (err) {
                return res.status(500).send({
                    error: "ObjectID is malformed"
                })
            }

            return res.status(200).send({
                status: doc.status
            })
        });
    }
}