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

	//console.log("make_visited_links: " + links.length);

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

		if (count > 0)
			links[i].style.opacity = 0.5;
		else
			links[i].style.opacity = 1.0;
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
	//console.log("focus");
	if (e.target instanceof Components.interfaces.nsIDOMHTMLDocument)
		make_visited_document_and_frames(e.target.defaultView);
}

function dcom_content_loaded_listener(e) {
	//console.log("dcom content loaded");
	// watch for changes to pages loading additional content containing links
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

	// if event is for the current visible document, we have already
	// received focus event and run an update for this document, even
	// though it was not fully loaded. make sure it is updated again.
	if (e.target == top_tab().document)
		e.target.ls_history_version = -1;

	make_visited_document_and_frames(top_tab());
}

function add_window(window) {
	window.addEventListener("focus", focus_listener, true);
	window.addEventListener("DOMContentLoaded", dcom_content_loaded_listener, true);
	make_visited_document_and_frames(top_tab());
}

function remove_window(window) {
	window.removeEventListener("focus", focus_listener, true);
	window.removeEventListener("DOMContentLoaded", dcom_content_loaded_listener, true);
}

var window_listener = {
	onOpenWindow: function(xul_window) {
		var window = xul_window.QueryInterface(Components.interfaces.nsIInterfaceRequestor).getInterface(Components.interfaces.nsIDOMWindow);

		function on_window_load() {
			window.removeEventListener("load", on_window_load);
			if (window.document.documentElement.getAttribute("windowtype") == "navigator:browser")
				add_window(window);
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
		onTitleChanged: function (uri, page_title) { },
		onDeleteURI: function (uri) { },
		onClearHistory: function () { },
		onPageChanged: function (uri, what, value) { },
		onPageExpired: function (uri, visit_time, whole_entry) { },
		onVisit: function (uri, visit_id, time, session_id, referring_id, transition_type) {
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

	for_each_open_window(add_window);
	Services.wm.addListener(window_listener);
}

function shutdown(data, reason) {
	var history = Components.classes["@mozilla.org/browser/nav-history-service;1"].getService(Components.interfaces.nsINavHistoryService);
	history.removeObserver(history_observer);

	for_each_open_window(remove_window);
	Services.wm.removeListener(window_listener);
}

function install(data, reason) { }

function uninstall(data, reason) { }
