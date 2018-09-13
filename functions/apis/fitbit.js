/**
 * functions for interacting with the Fitbit API
 */
'use strict';

const {functions, firestore} = require('../firebase-imports');
const request = require('request');
const rp = require('request-promise-native');

const client_id = "22CZGM";
const client_secret = "5604c5b55933fad4146c877ce6ff8224";

// const fitbit_integration_redirect_uri = '&redirect_uri=https://us-central1-wide-app.cloudfunctions.net/app/auth/fitbit';
const fitbit_integration_redirect_uri = 'http://localhost:5000/wide-app/us-central1/app/auth/fitbit';
const access_token_endpoint = 'https://api.fitbit.com/oauth2/token?';

exports.integrateFitbit = (req, res, next) => {
    console.log(req.query);
    console.log(req.headers);
    const userId = req.query.state;
    res.send(`<h4>Please close this browser window now.</h4>`);
    if (!req.query.error) {
        const reqOpts = {
            uri: access_token_endpoint,
            form: {
                code: req.query.code,
                client_id: client_id, //functions.config().fitbit-config.client_id,
                grant_type: 'authorization_code',
                redirect_uri: fitbit_integration_redirect_uri,
                state: userId,
            },
            method: 'POST',
            headers: {
                'Content-Type': 'Content-Type: application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + new Buffer(client_id + ':' + client_secret).toString('base64')
                // 'Authorization': 'Basic ' + new Buffer(functions.config().fitbit-config.client_id +
                //     ':' + functions.config().fitbit-config.client_secret).toString('base64')
            }
        };
        const userDoc = firestore.doc(`users/${userId}`);

        rp(reqOpts).then((response) => {
            const fitbit_grant = JSON.parse(response);
            return userDoc.set({
                isFitbitAuthenticated: true,
                fitbit_token_expires: fitbit_grant.expires_in + Date.now(),
                fitbit_access_data: fitbit_grant},
                {merge: true});
        }).then((writeResult) => {
            console.log('Data was stored in Firestore');
            console.log(writeResult);
            return;
        }).catch((error) => {
            throw error;
        });
    }
};
