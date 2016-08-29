import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import 'meteor/accounts-oauth';
import { OAuth } from 'meteor/oauth';
import { Config, GrantManager } from 'keycloak-auth-utils';
import Future from 'fibers/future';
import { HTTP } from 'meteor/http';
import moment from 'moment';
import _ from 'lodash';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const KEYCLOAK_PREFIX = 'keycloak';
//TODO: Replace following contant with your clientId
const KEYCLOAK_CLIENT = 'client';
const KEYCLOAK_SERVICE = `${KEYCLOAK_PREFIX}-${KEYCLOAK_CLIENT}`;

Meteor.startup(function() {

	Accounts.oauth.registerService(KEYCLOAK_SERVICE);

	ServiceConfiguration.configurations.upsert({ service: KEYCLOAK_SERVICE }, {
		$set: {
			"loginStyle": "redirect",
			//TODO: Replace following keys with your client Keycloak OIDC JSON Keys
			"realm": "realm",
			"realm-public-key": "realm-public-key",
			"auth-server-url": "auth-server-url",
			"ssl-required": "ssl-required",
			"resource": "resource",
			"public-client": "public-client",
			"use-resource-role-mappings": "use-resource-role-mappings"
		}
	});

	Meteor.publish("keycloak-user-data", function() {
		if (this.userId) {

			let config = ServiceConfiguration.configurations.findOne({ service: KEYCLOAK_SERVICE });
			let fields = {};
			fields[`services.${KEYCLOAK_SERVICE}.id`] = 1;
			fields[`services.${KEYCLOAK_SERVICE}.name`] = 1;
			fields[`services.${KEYCLOAK_SERVICE}.email`] = 1;
			fields[`services.${KEYCLOAK_SERVICE}.roles`] = 1;

			let user = Meteor.users.findOne({ _id: this.userId }, {
				fields: fields
			});

			let clientRoles = user.services[KEYCLOAK_SERVICE].roles.resource_access[config.resource] || {};
			let realmRoles = user.services[KEYCLOAK_SERVICE].roles.realm_access || {};

			this.added("users", this.userId, {
				keycloakId: user.services[KEYCLOAK_SERVICE].id,
				profile: {
					name: user.services[KEYCLOAK_SERVICE].name
				},
				emails: [
					user.services[KEYCLOAK_SERVICE].email
				],
				roles: {
					client: clientRoles,
					realm: realmRoles
				}
			});
			this.ready();
		} else {
			this.ready();
		}
	});

	OAuth.registerService(KEYCLOAK_SERVICE, 2, null, function(query) {

		let future = new Future();
		let code = query.code;
		let sessionId = query.state;
		let config = ServiceConfiguration.configurations.findOne({ service: KEYCLOAK_SERVICE });
		let redirectUri = OAuth._redirectUri(KEYCLOAK_SERVICE, config);
		let request = { "session": { "auth_redirect_uri": redirectUri } };

		let keycloakConfig = new Config(config);
		let grantManager = new GrantManager(keycloakConfig);

		let postOptions = {
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'X-Client': 'keycloak-nodejs-auth-utils'
			},
			params: {
				client_session_state: sessionId,
				code: code,
				grant_type: 'authorization_code',
				client_id: config.resource,
				redirect_uri: redirectUri
			}
		};
		let grant = grantManager.obtainFromCode(request, code, sessionId, undefined, function(error, grant) {

			if (error) {
				future.throw(error);
				return;
			}

			let filter = {};
			filter[`services.${KEYCLOAK_SERVICE}.id`] = grant.access_token.content.preferred_username;

			let user = Meteor.users.findOne(filter);

			let roles = {};
			if (user) {
				roles = user.services[KEYCLOAK_SERVICE].roles || {};
			}
			roles.resource_access = roles.resource_access || {};
			roles.resource_access[KEYCLOAK_CLIENT] = ((grant.access_token.content.resource_access || {})[KEYCLOAK_CLIENT] || {}).roles;
			roles.realm_access = (grant.access_token.content.realm_access || {});

			let result = {
				serviceData: {
					id: grant.access_token.content.preferred_username,
					expiresAt: moment().add(grant.expires_in, 's').toDate(),
					name: grant.access_token.content.name,
					email: grant.access_token.content.email,
					given_name: grant.access_token.content.given_name,
					family_name: grant.access_token.content.family_name,
					grant: grant.toString(),
					roles: roles
				},
				options: {
					profile: {
						name: grant.access_token.content.name
					}
				}
			};
			future.return(result);
		});

		return future.wait();
	});

	Meteor.methods({
		getKeycloakConfiguration: function() {
			return ServiceConfiguration
				.configurations
				.findOne({ "service": KEYCLOAK_SERVICE }, {
					"fields": {
						"auth-server-url": 1,
						"loginStyle": 1,
						"realm": 1,
						"realmUrl": 1,
						"resource": 1,
						"realm-public-key": 1
					}
				});
		}
	});

});
