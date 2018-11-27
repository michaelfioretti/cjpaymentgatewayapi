const StellarHDWallet = require('stellar-hd-wallet')
const axios = require('axios')

module.exports = {
    register: async(req, res) => {
        let user = await Helpers.getUserByField(req.body.email, 'email')
        if (user) {
            return res.status(422).send({
                error: `User with email '${req.body.email}' has already signed up!`
            })
        }

        const mnemonic = StellarHDWallet.generateMnemonic()
        const wallet = StellarHDWallet.fromMnemonic(mnemonic)
        const address = wallet.getPublicKey(0)
        const encryptedMnemonic = await Helpers.encrypt(mnemonic, req.body.password)

        user = {
            name: req.body.name,
            wallet: {
                address: address,
                mnemonic: encryptedMnemonic
            },
            email: req.body.email,
            invoiceIds: []
        }

        db.collection('vendors').insertOne(user, function(err, result) {
            if (err) {
                return res.status(500).send({
                    error: err
                })
            }

            return res.status(200).send({
                message: `User with email '${req.body.email} saved successfully!`,
                user: user
            })
        });
    },
    login: async(req, res) => {
        let user = await Helpers.getUserByField(req.body.email, 'email')
        if (!user) {
            return res.status(422).send({
                error: `No user found with email '${req.body.email}'`
            })
        }

        try {
            let decrypted = await Helpers.decrypt(user.wallet.mnemonic, req.body.password)
            if (!decrypted) {
                return res.status(401).send({
                    error: "Password incorrect"
                })
            }

            const wallet = StellarHDWallet.fromMnemonic(decrypted)
            const address = wallet.getPublicKey(0)

            if (address != user.wallet.address) {
                return res.status(401).send({
                    error: "The password you provided has decrypted a mnemonic that is not associated with your account"
                })
            }

            // Get invoices
            let invoices = await Helpers.getVendorInvoices(user.invoiceIds)
            let txs = await Helpers.getVendorTxs(user._id)
            user.invoices = invoices
            
            return res.status(200).send({
                user: user
            })

        } catch (e) {
            return res.status(401).send({
                error: "Password incorrect"
            })
        }
    },
    balance: async(req, res) => {
        let balance
        let data = await axios("https://horizon.stellar.org/accounts/" + req.params.address)
        data.data.balances.forEach(bal => {
            if (bal.asset_code === 'CJS') {
                balance = bal.balance
            }
        })

        return res.status(200).send({
            balance: balance
        })
    }
}