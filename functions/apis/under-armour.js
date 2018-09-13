/* eslint-disable consistent-return,promise/always-return */
/**
 * My UA API for interacting with the Under Armour (MapMyWalk) API
 */
'use strict';

const {bucket} = require('../firebase-imports');

const request = require('request');
const rp = require('request-promise-native');
const fs = require('fs');
const os = require('os');
const path = require('path');

let uaClientCredentialsAccessToken = 0;
let uaCCAccessTokenExpires = 0;
const uaAPIEnd = 'https://api.ua.com/v7.1/';
const uaNextAPIEnd = 'https://api.ua.com'
const uaClientID = 'cuoxcst2q4yxbyutptpokm6rttklhozx';
const uaClientSecret = '33jpvlvmlhmjstwfmhcrsf7mp3c67uvepfsj27msovmaxb54trfgd34lkwzyxd7x';

exports.updateClientCredentials = (req, res, next) => {
    console.log(uaClientCredentialsAccessToken);
    console.log(uaCCAccessTokenExpires);
    if (Date.now() > uaCCAccessTokenExpires) {
        const formData = {
            grant_type: 'client_credentials',
            client_id: uaClientID,
            client_secret: uaClientSecret
        };
        const endpoint = uaAPIEnd + 'oauth2/access_token';
        const opts = {
            uri: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            formData: formData
        };
        request(opts, (error, response) => {
            console.log(error, response.body);
            if (error) {
                res.status(403).send('An error occured at UA Api');
                return;
            }
            const data = JSON.parse(response.body);
            uaCCAccessTokenExpires = Date.now() + data.expires_in;
            uaClientCredentialsAccessToken = data.access_token;
            return next();
        });
    } else {
        return next();
    }
};

exports.getUARoutes = (req, res, next) => {
    console.log(req.headers);
    console.log(req.query);
    const params = '?close_to_location=' + req.query.location + '&order_by=distance_from_point&text_search=walk&field_set=detailed';
    const endpoint = uaAPIEnd + 'route/' + params;
    const opts = {
        uri: endpoint,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + uaClientCredentialsAccessToken
        }
    };
    request(opts, (error, response) => {
        res.send(response);
    });
};

exports.getNextRoutes = (req, res, next) => {
    console.log(req.headers);
    console.log(req.query);
    console.log(req.params);
    const endpoint = uaNextAPIEnd + req.query.endpoint;
    const opts = {
        uri: endpoint,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + uaClientCredentialsAccessToken
        }
    };
    request(opts, (error, response) => {
        res.send(response);
    });
};

exports.getKMLFile = (req, res, next) => {

    const fileName = req.query.id + '.kml';
    bucket.file('routes/' + fileName).exists().then((fileExists) => {
        console.log(fileExists);
        console.log("DEBUG: Does the file exist? " + fileExists);
        if (fileExists[0]) {
            console.log('This file does exist so we will just get the mediaLink for it!!!');
            const config = {
                action: 'read',
                expires: Date.now() + (1000 * 60 * 60 * 24 * 5)
            }
            bucket.file('routes/' + fileName).getMetadata().then((data) => {
                console.log('DEBUG: This file already exists!');
                console.log(data);
                res.send(data);
            }).catch((err) => {
                console.log(err);
                throw err;
            });
        } else {
            console.log('DEBUG: This file does not exist yet, will be created!');
            // console.log(req.body);
            const params = '?format=kml&field_set=detailed&line_color=ff0000ff&marker_unit=mile&show_marker_every=1';
            const endpoint = uaAPIEnd + 'route/' + req.query.id + '/' + params;
            const opts = {
                uri: endpoint,
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + uaClientCredentialsAccessToken
                }
            };
            req.body.filename = fileName;
            const tempFilePath = path.join(os.tmpdir(), fileName);
            return rp(opts).then((response) => {
                // console.log(response);
                return new Promise((resolve,reject) => {
                    fs.writeFile(tempFilePath, response, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }).then(() => {
                console.log('Does the file exist yet?');
                console.log(fs.existsSync(tempFilePath));
                const options = {
                    resumable: false,
                    public: true,
                    metadata: { metadata: {route_id: req.query.id} },
                    destination: 'routes/' + fileName
                };
                return bucket.upload(tempFilePath, options);
            }).then((data) => {
                console.log(data);
                fs.unlinkSync(tempFilePath);
                res.send(data);
            }).catch((err) => {console.log(err)});
        }
    }).catch((err) => {
        console.log('ERROR: A serious error occured!!!!');
        console.log(err);
        throw err;
    });
};

