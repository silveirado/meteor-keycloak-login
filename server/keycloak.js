import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import 'meteor/accounts-oauth';
import { OAuth } from 'meteor/oauth';
import { Config, GrantManager } from 'keycloak-auth-utils';
import Future from 'fibers/future';
import { HTTP } from 'meteor/http';
import moment from 'moment';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

Meteor.onConnection(() => {
	console.log('CONNECT');
});


Meteor.publish("keycloak-user-data", function() {
	if (this.userId) {

		let config = ServiceConfiguration.configurations.findOne({ service: 'keycloak' });

		let user = Meteor.users.findOne({ _id: this.userId }, {
			fields: {
				'services.keycloak.id': 1,
				'services.keycloak.name': 1,
				'services.keycloak.email': 1,
				'services.keycloak.roles': 1
			}
		});

		let clientRoles = user.services.keycloak.roles[config.resource] || {};
		let realmRoles = user.services.keycloak.roles.realm_access || {};

		this.added("users", this.userId, {
			keycloakId: user.services.keycloak.id,
			profile: {
				name: user.services.keycloak.name
			},
			emails: [
				user.services.keycloak.email
			],
			roles: {
				client: clientRoles.roles,
				realm: realmRoles.roles
			}
		});
		this.ready();
	} else {
		this.ready();
	}
});

Meteor.startup(function() {

	Accounts.oauth.registerService('keycloak');

	ServiceConfiguration.configurations.upsert({ service: "keycloak" }, {
		$set: {
			"loginStyle": "redirect",
			"realm": "celic",
			"realm-public-key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxwkQGO1G+swYl5VrSjm751yK4IhcZTubLhs0oJag6uBrDBDf9TOhG0NpPtgWeOianv6X5nhwHsRpwXKmnVTV5Boow+As/s03hnE8xsSLOVdKwbBGo3nIJ3vELPwVVqDhOscqGj/bmO8OA9mChrl/erFFgzGaf+9KUsQdA6msyJXVi8h02ipDmQUw5Hj55FJLeyGd710CQ/qnFaQxVnM/sTF5LNcN+mhRRDMBVtpcEZ19M1kkJrMHuZq/AmU3xS0f482HxYHWvd2oSdYc5TDeQ8daQwsKC0CD58MPjBp7Gt/GGqQxyqBt5/AUEGphRecRyMVQvC2ASaSvpCcyJWpl7QIDAQAB",
			"auth-server-url": "https://sso-des.procempa.com.br/auth",
			"ssl-required": "external",
			"resource": "celic-requisicoes-servico",
			"public-client": true,
			"use-resource-role-mappings": true
		}
	});

	OAuth.registerService('keycloak', 2, null, function(query) {

		let future = new Future();
		let code = query.code;
		let sessionId = query.state;
		let config = ServiceConfiguration.configurations.findOne({ service: 'keycloak' });
		let redirectUri = OAuth._redirectUri('keycloak', config);
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
			let result = {
				serviceData: {
					id: grant.access_token.content.preferred_username,
					expiresAt: moment().add(grant.expires_in, 's').toDate(),
					name: grant.access_token.content.name,
					email: grant.access_token.content.email,
					given_name: grant.access_token.content.given_name,
					family_name: grant.access_token.content.family_name,
					grant: grant.toString(),
					roles: {
						resource_access: grant.access_token.content.resource_access,
						realm_access: grant.access_token.content.realm_access
					}
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
				.findOne({ "service": 'keycloak' }, {
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
