(function (window, angular, undefined) { 'use strict';
  var parse = function (link) {
  	var result = {};
  	var parts = link.split(';');
  	var matchUrl = parts.shift().match(/<(.*)>/);

  	parts.map(function (part) {
  		var matchPart = part.match(/ *(.*) *= *"(.*)" */);
  		if (matchPart) {
  			result[matchPart[1]] = matchPart[2];
  		}
  	});

  	if (matchUrl) {
  		result.url = matchUrl[1];
  	}

  	return result;
  };

  var angularLinkHeaderParser = angular.module('LinkHeaderParser', []);
  angularLinkHeaderParser.factory('linkHeaderParse', function(){
  	return function (links) {
  	  var result = links.split(',').map(function (link) {
  	  	return parse(link);
  	  });
  	  result.rels = result.filter(function (info) {
  	  	return info && info.rel && info.url;
  	  }).reduce(function (rels, info) {
  	  	rels[info.rel] = info.url;
  	  	return rels;
  	  }, {});
  	  return result;
  	};
  });
})(window, window.angular);
