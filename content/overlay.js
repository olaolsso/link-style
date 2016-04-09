var history_listener_inited = false;
var history_version = 0;

function make_visited_links(links, base_uri_string) {
	if (links.length == 0)
		return;

	var io = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
	var base_uri = io.newURI(base_uri_string, null, null)

	var history = Cc["@mozilla.org/browser/nav-history-service;1"].getService(Ci.nsINavHistoryService);

	var options = history.getNewQueryOptions();
	options.includeHidden = true;
	options.maxResults = 1;
	options.queryType = options.QUERY_TYPE_HISTORY;
	options.resultType = options.RESULTS_AS_URI;

	var query = history.getNewQuery();

	for (var i = 0; i < links.length; i++) {
		query.uri = io.newURI(links[i].href, null, base_uri);

		var result = history.executeQuery(query, options);
		result.root.containerOpen = true;
		var count = result.root.childCount;
		result.root.containerOpen = false;

		if (count > 0) {
			links[i].style.opacity = 0.4;
			//links[i].style.textDecoration = "underline line-through";
		} else {
			links[i].style.opacity = 1.0;
			//links[i].style.textDecoration = "underline";
		}
	}
}

function make_visited_document(d) {
	if (typeof d.links == "undefined")
		return;

	if (typeof d.ls_history_version == "undefined")
		d.ls_history_version = -1;

	if (history_version > d.ls_history_version) {
		d.ls_history_version = history_version;
		make_visited_links(d.links, d.baseURI);
	}
}

function make_visited_document_and_frames(w) {
	make_visited_document(w.document);
	for (var i = 0; i < w.frames.length; i++)
		make_visited_document(w.frames[i].document);
}

function init_history_listener() {
	if (!history_listener_inited) {
		var observer = {
			onBeginUpdateBatch: function() { },
			onEndUpdateBatch: function() { },
			onTitleChanged: function(aURI, aPageTitle) { },
			onDeleteURI: function(aURI) { },
			onClearHistory: function() { },
			onPageChanged: function(aURI, aWhat, aValue) { },
			onPageExpired: function(aURI, aVisitTime, aWholeEntry) { },
			onVisit: function(aURI, aVisitID, aTime, aSessionID, aReferringID, aTransitionType) {
				history_version++;
			},
			QueryInterface: function(iid) {
				if (iid.equals(Components.interfaces.nsINavHistoryObserver) || iid.equals(Components.interfaces.nsISupports))
					return this;
				throw Cr.NS_ERROR_NO_INTERFACE;
			},
		};

		var history = Cc["@mozilla.org/browser/nav-history-service;1"].getService(Ci.nsINavHistoryService);
		history.addObserver(observer, false);

		history_listener_inited = true;
	}
}

gBrowser.addEventListener("focus", function(e) {
	init_history_listener();
	if (e.target instanceof Window)
		make_visited_document_and_frames(e.target);
}, true);

gBrowser.addEventListener("load", function(e) {
	// DOMContentLoaded does not occur for plain images
	init_history_listener();
	// update links on current window, not event target
	make_visited_document_and_frames(window.content);
}, true);

gBrowser.addEventListener("DOMContentLoaded", function(e) {
	init_history_listener();

	// watch for changes to pages loading additional content
	// containing links after initial content load is complete
	var observer = new MutationObserver(function(mutations) {
		mutations.forEach(function(mutation) {
			for (var i = 0; i < mutation.addedNodes.length; i++) {
				var node = mutation.addedNodes[i];
				if (node.nodeType == Node.ELEMENT_NODE && node.ownerDocument == window.content.document) {
					var aa = node.getElementsByTagName("A");
					if (aa.length > 0)
						make_visited_links(aa, node.ownerDocument.baseURI);
				}
			}
		})
	});
	observer.observe(e.target, { childList: true, subtree: true });

	// if event is for the current visible document, we have already
	// received focus event and run an update for this document, even
	// though it was not fully loaded. make sure it is updated again.
	if (e.target == content.document)
		content.document.ls_history_version = -1;

	// update links on current window, not event target
	make_visited_document_and_frames(window.content);
});
