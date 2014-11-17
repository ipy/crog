angular.module('crog', ['LocalStorageModule', 'LinkHeaderParser', 'ab-base64', 'ngScrollbar'])
.service('Setting', ['localStorageService', function(localStorageService){
	var _settings = localStorageService.get('settings');
	if (!_settings) {
		localStorageService.set('settings', _settings = {configured:false});
	}
	var Setting = function (settings) {
		if (!settings) {
			void(0);
		} else if (typeof settings === 'object') {
			localStorageService.set('settings', _settings = settings);
		} else {
			throw new Error('invalid argument');
		}
		return _settings;
	};
	return Setting;
}])
.service('GitHubAPI', ['$http', '$q', 'Setting', 'linkHeaderParse', function($http, $q, setting, linkHeaderParse){
	var _baseUrl = 'https://api.github.com';
	var requestAPI = function (method, api, data) {
		$http.defaults.headers.common['Authorization'] = 'token ' + setting().token;
		return $http({
			url: _baseUrl + api,
			method: (method || 'get').toUpperCase(),
			params: data
		});
	};
	var _token;
	this.setToken = function (token) {
		_token = token;
	};
	this.getCommentsOfRepo = function (owner, repo, page, per_page) {
		page = page || 1;
		per_page = per_page || 100;
		return requestAPI('get', '/repos/' + owner + '/' + repo + '/comments', {
			per_page: per_page,
			page: page
		});
	};
	this.getCommentsOfRepoAll = function (owner, repo) {
		var startPage = 1;
		var api = this;
		var dfd = $q.defer();
		api.getCommentsOfRepo(owner, repo).success(function (data, status, headers) {
			if (!data || !data.length) {
				dfd.resolve([]);
			}
			var linkString = headers('Link');
			var links, lastPageMatch, lastPage;
			if (linkString && (links = linkHeaderParse(linkString))
				&& links.rels && links.rels.last
				&& (lastPageMatch = links.rels.last.match(/.*[\?|&]page=(\d+).*/))
				&& lastPageMatch
				&& (lastPage = parseInt(lastPageMatch[1]))) {
				var promises = (function () {
					var array = [];
					for (var i = 2; i <= lastPage; i++ ) {
						(function (i) {array.push(i);})(i);
					};
					return array;
				})().map(function (page) {
					return api.getCommentsOfRepo(owner, repo, page).then(function (res) {return res.data;});
				});
				dfd.resolve($q.all(promises).then(function (results) {
					return results.sort(function (a, b) {
						if (!a || !a[0]) {
							return -1;
						} else if (!b || !b[0]) {
							return 1;
						}
						if (a[0]['created_at'] < b[0]['created_at']) {
							return -1
						} else if (a[0]['created_at'] > b[0]['created_at']) {
							return 1;
						} else {
							return 0;
						};
					}).reduce(function (data, result) {
						return data.concat(result);
					}, data);
				}));
			} else {
				dfd.resolve(data);
			}
		});
		return dfd.promise;
	};
	this.getCommitsByIDs = function (owner, repo, ids) {
		var dtd = $q.defer();
		if (!ids || !ids.length) {
			dtd.reject();
		}
		dtd.resolve($q.all(ids.map(function (id) {
			return requestAPI('get',  '/repos/' + owner + '/' + repo + '/commits/' + id).then(function (res) {return res.data;});
		})));
		return dtd.promise;
	};
	this.getCommitsByID = function (owner, repo, id) {
		return requestAPI('get',  '/repos/' + owner + '/' + repo + '/commits/' + id).then(function (res) {return res.data;});
	};
	this.getContent = function (owner, repo, path, ref) {
		return requestAPI('get',  '/repos/' + owner + '/' + repo + '/contents/' + path, {path: path, ref: ref}).then(function (res) {return res.data;});
	}
}])
.controller('AuthCtrl', ['$scope', 'Setting', 'GitHubAPI', 'base64', function ($scope, setting, GitHubAPI, base64){
	$scope.settings = setting();
	$scope.commits = null;
	$scope.submitSetting = function () {
		$scope.settings.configured = !! setting($scope.settings);
		if (!$scope.commits) {
			$scope.loadComments();
		}
	};
	$scope.resetSetting = function () {
		$scope.settings.configured = false;
	};
	$scope.loadComments = function () {
		GitHubAPI.getCommentsOfRepoAll(setting().owner, setting().repo).then(function (allComments) {
			var commits = {};
			var commitsArr = [];
			var userCommentCount = {};
			var oneMonthEarlier = new Date();
			oneMonthEarlier.setMonth(oneMonthEarlier.getMonth() - 1);
			for (var i = allComments.length - 1; i >= 0; i--) {
				var comment = allComments[i];
				var createTime = new Date(comment['created_at']);
				if (!userCommentCount[comment.user.login]) {
					userCommentCount[comment.user.login] = {total: 0, recent: 0};
				}
				userCommentCount[comment.user.login].total = userCommentCount[comment.user.login].total + 1;
				if (createTime > oneMonthEarlier) {
					userCommentCount[comment.user.login].recent = userCommentCount[comment.user.login].recent + 1;
				}
				if (!commits[comment['commit_id']]) {
					commits[comment['commit_id']] = {
						sha: comment['commit_id'],
						sortKey: createTime,
						comments: []
					};
					commitsArr.push(commits[comment['commit_id']]);
				}
				commits[comment['commit_id']].comments.push(comment);
			};
			commitsArr.sort(function (a, b) {
				if (a.sortKey < b.sortKey) return 1;
				else if (a.sortKey > b.sortKey) return -1;
				else return 0;
			});
			var userCommentCountArr = [];
			for(var login in userCommentCount) {
				userCommentCountArr.push({login: login, total: userCommentCount[login].total, recent: userCommentCount[login].recent});
			}
			$scope.userCommentCount = userCommentCountArr;
			$scope.commits = commitsArr;
			for (var i = 0, l = commitsArr.length; i < l; i++) {
				(function(i) {
					GitHubAPI.getCommitsByID(setting().owner, setting().repo, commitsArr[i].sha).then(function (commitInfo) {
						commitsArr[i].info = commitInfo;
					});
				})(i);
			};
		});
	};
	$scope.showUserCommentCount = false;
	$scope.toggleUserCommentCount = function () {
		$scope.showUserCommentCount = !$scope.showUserCommentCount;
	};
	$scope.fileContent = null;
	$scope.loadFile = function (path, ref) {
		GitHubAPI.getContent(setting().owner, setting().repo, path, ref).then(function (data) {
			content = base64.decode(data.content);
			$scope.fileContent = content;
		});
	};
}])