import { ProtectedApi } from './protected-api';
import Future from 'fibers/future';

Meteor.methods({
	callApi: function() {
		let url = 'https://sso-des.procempa.com.br/auth/realms/procempa/protocol/openid-connect/userinfo';
		let api = new ProtectedApi(url);
		let future = new Future();

		api
			.get()
			.then((result) => {
				future.return(result);
			}, (error) => {
				future.throw(error);
			});

		try {
			return future.wait();
		} catch (err) {
			console.log(err);
			throw new Meteor.Error(err.response.statusCode, ((err.response || {}).data || {}).error_description || (err.response || {}).content);
		}

	}
});
