import { Meteor } from 'meteor/meteor';
import { Config, GrantManager, Grant } from 'keycloak-auth-utils';
import _ from 'lodash';
import { HTTP } from 'meteor/http';

const KEYCLOAK_PREFIX = 'keycloak';
//TODO: Replace following contant with your clientId
const KEYCLOAK_CLIENT = 'client';
const KEYCLOAK_SERVICE = `${KEYCLOAK_PREFIX}-${KEYCLOAK_CLIENT}`;


export class ProtectedApi {

	constructor(url, options) {
		this._url = url;
		this._options = options;
		let config = ServiceConfiguration.configurations.findOne({ service: KEYCLOAK_SERVICE });
		let keycloakConfig = new Config(config);
		keycloakConfig.bearerOnly = true;
		this.grantManager = new GrantManager(keycloakConfig);
		this.grant = this.grantManager.createGrant(Meteor.user().services[KEYCLOAK_SERVICE].grant);
	}

	get() {
		return this.call("GET")
	}

	post() {
		return this.call("POST")
	}

	call(method) {
		return new Promise((resolve, reject) => {
			this.__refreshToken((error, grant) => {
				if (error) {
					reject(error);
				} else {
					let options = this._options || {};
					options.headers = options.headers || {};
					_.assign(options.headers, {
						'Authorization': 'Bearer ' + grant.access_token.token,
						'Accept': 'application/json',
						'X-Client': 'procempa-protected-api'
					});

					HTTP.call(method, this._url, options, (error, result) => {
						if (error) {
							reject(error);
						} else {
							resolve(result.data);
						}
					});
				}
			});
		});
	}

	__refreshToken(callback) {
		this.grantManager.ensureFreshness(this.grant, (error, grant) => {
			if (error) {
				callback(error);
				return;
			} else {
				this.__saveGrant(grant);
				callback(null, grant);
			}
		});
	}

	__saveGrant(grant) {
		let newGrant = {};
		newGrant[`services.${KEYCLOAK_SERVICE}.grant`] = grant.toString();

		Meteor.users.update({ "_id": Meteor.userId() }, {
			$set: newGrant
		});
	}


}
