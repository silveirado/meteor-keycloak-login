import { OAuth } from 'meteor/oauth';
import { Random } from 'meteor/random';
import Keycloak from 'keycloak-connect';
import { Accounts } from 'meteor/accounts-base';
import localForage from 'localforage';
import { DDP } from 'meteor/ddp-client';

import 'meteor/accounts-oauth';

const KEYCLOAK_PREFIX = 'keycloak';
//TODO: Replace following contant with your clientId
const KEYCLOAK_CLIENT = 'client';
const KEYCLOAK_SERVICE = `${KEYCLOAK_PREFIX}-${KEYCLOAK_CLIENT}`;

export class App {

	constructor() {
		Accounts.oauth.registerService(KEYCLOAK_SERVICE);
	}

	logout() {
		Meteor.logout(function() {
			Meteor.call("getKeycloakConfiguration", function(error, config) {
				let keycloak = new Keycloak({}, config);
				let logoutUrl = keycloak.logoutUrl(Meteor.absoluteUrl());
				window.location = logoutUrl;
			});

		});
	}

	configureRouter(config, router) {
		config.title = "Meteor Aurelia Seed";
		config.addPipelineStep('authorize', AuthorizeStep);
		config.map([
			{ route: '', redirect: 'exemplo1' },
			{
				route: "exemplo1",
				name: "exemplo1",
				moduleId: "./pages/paginaExemplo1/exemplo1",
				nav: true,
				title: "Exemplo 1"
			}, {
				route: "exemplo2",
				name: "exemplo2",
				moduleId: "./pages/paginaExemplo2/exemplo2",
				nav: true,
				title: "Exemplo 2"
			}, {
				route: "contato",
				name: "contato",
				moduleId: "./pages/contato/contato",
				nav: true,
				title: "Contatos",
				settings: { roles: ['admin'] }
			}
		]);
		this.router = router;
	}
}

class AuthorizeStep {

	loadKeycloakConfig() {
		return new Promise((resolve, reject) => {
			localForage.getItem(`${KEYCLOAK_SERVICE}.config`, (err, value) => {
				if (value) {
					resolve(value);
				} else {
					Meteor.call("getKeycloakConfiguration", function(error, config) {
						if (config) {
							localForage.setItem(`${KEYCLOAK_SERVICE}.config`, config);
							resolve(config);
						} else {
							console.error(error);
							reject(error);
						}
					});
				}
			});
		});
	}

	run(navigationInstruction, next) {
		let roles = navigationInstruction.getAllInstructions()[0].config.settings.roles;
		if (roles) {
			if (Meteor.userId() === null && !Meteor.loggingIn()) {
				return new Promise((resolve, reject) => {
					//Login
					this
						.loadKeycloakConfig()
						.then((config) => {
							let keycloak = new Keycloak({}, config);
							let uuid = Random.secret();
							let redirectUrl = OAuth._redirectUri(KEYCLOAK_SERVICE, config);
							let loginStyle = OAuth._loginStyle(KEYCLOAK_SERVICE, {
								loginStyle: 'redirect'
							});

							let state = OAuth._stateParam(loginStyle, uuid);

							let loginUrl = keycloak.loginUrl(state, redirectUrl);

							OAuth.launchLogin({
								loginService: KEYCLOAK_SERVICE,
								loginStyle: 'redirect',
								loginUrl: loginUrl,
								credentialToken: uuid
							});
						}, (error) => {
							console.error(error);
							resolve(next.cancel());
						});
				});
			} else {
				return new Promise((resolve, reject) => {
					let validateRoles = () => {
						if (Meteor.loggingIn()) {
							Meteor.setTimeout(validateRoles, 100);
							return;
						}

						Meteor.subscribe("keycloak-user-data", () => {
							let user = Meteor.user();
							let userRoles = (user.roles || {});
							if (userRoles.client && _.intersection(userRoles.client, roles).length) {
								resolve(next());
							} else if (userRoles.realm && _.intersection(userRoles.realm, roles).length) {
								resolve(next());
							} else {
								alert('Sem permissão')
								reject(next.cancel());
							}
						});
					};

					validateRoles();


				});
			}
		}

		return next();
	}
}
