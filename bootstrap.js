var history_observer;
var history_version = 0;

Components.utils.import("resource://gre/modules/Services.jsm");

function top_tab() {
	return Services.wm.getMostRecentWindow("navigator:browser").content.content;
}

function for_each_open_window(func) {
	var windows = Services.wm.getEnumerator("navigator:browser");
	while (windows.hasMoreElements())
	    func(windows.getNext().QueryInterface(Components.interfaces.nsIDOMWindow));
}

function make_visited_links(links, base_uri_string) {
	if (links.length == 0)
		return;

	console.log("make_visited_links: " + links.length);

	var io = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
	var base_uri = io.newURI(base_uri_string, null, null)

	var history = Components.classes["@mozilla.org/browser/nav-history-service;1"].getService(Components.interfaces.nsINavHistoryService);

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

function focus_listener(e) {
	if (e.target instanceof Components.interfaces.nsIDOMHTMLDocument)
		make_visited_document_and_frames(e.target.defaultView);
}

function dcom_content_loaded_listener(e) {
	// watch for changes to pages loading additional content
	// containing links after initial content load is complete
	e.target.ls_observer = new e.target.defaultView.MutationObserver(function (mutations) {
		mutations.forEach(function (mutation) {
			for (var i = 0; i < mutation.addedNodes.length; i++) {
				var node = mutation.addedNodes[i];
				if (node.nodeType == 1 /*ELEMENT_NODE*/ && node.ownerDocument == e.target) {
					var aa = node.getElementsByTagName("A");
					if (aa.length > 0)
						make_visited_links(aa, node.ownerDocument.baseURI);
				}
			}
		})
	});
	e.target.ls_observer.observe(e.target, { childList: true, subtree: true });

	make_visited_document_and_frames(top_tab());
}

function init(window) {
	window.addEventListener("focus", focus_listener, true);
	window.addEventListener("DOMContentLoaded", dcom_content_loaded_listener, true);
	make_visited_document_and_frames(top_tab());
}

function deinit(window) {
	window.removeEventListener("focus", focus_listener, true);
	window.removeEventListener("DOMContentLoaded", dcom_content_loaded_listener, true);
}

var window_listener = {
	onOpenWindow: function(xul_window) {
		var window = xul_window.QueryInterface(Components.interfaces.nsIInterfaceRequestor).getInterface(Components.interfaces.nsIDOMWindow);

		function on_window_load() {
			window.removeEventListener("load", on_window_load);
			if (window.document.documentElement.getAttribute("windowtype") == "navigator:browser")
				init(window);
		}
		window.addEventListener("load", on_window_load);
	},
	onCloseWindow: function (xul_window) { },
	onWindowTitleChange: function (xul_window, new_title) { }
};

function startup(data, reason) {
	history_observer = {
		onBeginUpdateBatch: function () { },
		onEndUpdateBatch: function () { },
		onTitleChanged: function (aURI, aPageTitle) { },
		onDeleteURI: function (aURI) { },
		onClearHistory: function () { },
		onPageChanged: function (aURI, aWhat, aValue) { },
		onPageExpired: function (aURI, aVisitTime, aWholeEntry) { },
		onVisit: function (aURI, aVisitID, aTime, aSessionID, aReferringID, aTransitionType) {
			history_version++;
			make_visited_document_and_frames(top_tab());
		},
		QueryInterface: function (iid) {
			if (iid.equals(Components.interfaces.nsINavHistoryObserver) || iid.equals(Components.interfaces.nsISupports))
				return this;
			throw Components.result.NS_ERROR_NO_INTERFACE;
		},
	};
	var history = Components.classes["@mozilla.org/browser/nav-history-service;1"].getService(Components.interfaces.nsINavHistoryService);
	history.addObserver(history_observer, false);

	for_each_open_window(init);
	Services.wm.addListener(window_listener);
}

function shutdown(data, reason) {
	if (reason == APP_SHUTDOWN)
		return;

	var history = Components.classes["@mozilla.org/browser/nav-history-service;1"].getService(Components.interfaces.nsINavHistoryService);
	history.removeObserver(history_observer);

	for_each_open_window(deinit);
	Services.wm.removeListener(window_listener);
}

function install(data, reason) { }

function uninstall(data, reason) { }
