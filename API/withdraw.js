const math = require('mathjs')
const MongoClient = require('mongodb')
const StellarHDWallet = require('stellar-hd-wallet')
const StellarSdk = require('stellar-sdk');
const server = new StellarSdk.Server('https://horizon.stellar.org');
StellarSdk.Network.usePublicNetwork();
const CJAsset = new StellarSdk.Asset(config.cjAssetCode, config.cjIssuer)

module.exports = {
    initiate: async(req, res) => {
        const amount = req.body.amount
        const destination = req.body.address
        console.log("destination: ", destination)
        console.log("amount: ", amount)

        let vendorId = new MongoClient.ObjectID(req.body.vendorId)
        let vendor = await Helpers.getUserByField(vendorId, '_id')
        let decrypted = await Helpers.decrypt(vendor.wallet.mnemonic, req.body.password)

        if (!decrypted) {
            return res.status(401).send({
                error: "Password incorrect"
            })
        }

        const wallet = StellarHDWallet.fromMnemonic(decrypted)

        let sourceKeypair = StellarSdk.Keypair.fromSecret(wallet.getSecret(0));
        let sourcePublicKey = sourceKeypair.publicKey();
        let accountFromStellar = await server.loadAccount(sourcePublicKey)

        let transaction = new StellarSdk.TransactionBuilder(accountFromStellar).addOperation(StellarSdk.Operation.payment({
                destination: destination,
                asset: CJAsset,
                amount: amount
            }))
            .build();

        transaction.sign(sourceKeypair);

        let transactionResult = await server.submitTransaction(transaction)
            .catch(e => {
            	return res.status(500).send({
            		message: "There was an error processing your withdraw",
            		error: e.response.data.extras
            	})
            })

        let txToSave = {
        	vendorId: vendorId,
            date: new Date().toISOString(),
            type: 'withdraw',
            amount: amount,
            link: transactionResult._links.transaction.href
        }

        // Save the invoice and update the vendor with their invoice
        db.collection('transactions').insertOne(txToSave, function(txSaveError, txSaveResult) {
            if (txSaveError) {
                return res.status(500).send({
                	error: txSaveError
                })
            } else {
            	return res.status(200).send({
            		message: "Withdraw successful"
            	})
            }
        })
    }
}