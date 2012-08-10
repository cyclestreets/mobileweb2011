// CycleStreets API details. 
var CS_API_KEY = '68f786d958d1dbfb';
var CS_API = 'http://www.cyclestreets.net/api/';
// Use localhost for testing
// var CS_API = 'http://localhost/api/';
var global_page_type = null;

// Route markers and instructions. 
var SET_FIRST_MARKER = '1. Tap to set start';
var SET_SECOND_MARKER = '2. Tap to set finish';
var COMPLETE_ROUTE = '3. Tap to route';
// List of waypoints
var itineraryMarkers = [];

// Route display. 
var map;
var route_data;
var routePath = null;
var individualPath = null;
var speedMph = null;
var photo_markers = [];

// Geolocation. 
var current_latlng = null;
var watchId = null;
var is_user_position_initialised = false;
var position_marker = null;

// Geocoding. 
var geodata = {};
var start_coords = [];
var finish_coords = [];
// CycleStreets API key
geodata['key'] = CS_API_KEY;


// Saved routes. 
var regexForRoutes = /^route-[\d]+$/;

var current_marker = null;

/*********************************************************
/ Styled popup (toast) messages.
*********************************************************/

function toastMessage(msg) {
    // Hide existing toast messages. 
    $('div.ui-loader').hide();
    var msg_text = "<div class='ui-loader ui-overlay-shadow ui-body-e ui-corner-all'>";
    msg_text += "<h1>" + msg + "</h1></div>";
    $(msg_text).css({ "display": "block", "opacity": 0.96, "z-index": 1000, "top": $(window).scrollTop() + 150 })
        .appendTo($.mobile.pageContainer)
        .delay(1500)
        .fadeOut(400, function () {
            $(this).remove();
        });
}

/*********************************************************
/ Local storage and cookies. 
/ Cookies are only used if localStorage is not supported.
*********************************************************/

function readCookie(name) {
    //console.log('readCookie: ' + name);
    var nameEQ = name + "=", ca = document.cookie.split(';'), i, c;
    for (i = 0; i < ca.length; i++) {
        c = ca[i];
        while (c.charAt(0) === ' ') {
            c = c.substring(1, c.length);
        } 
        if (c.indexOf(nameEQ) === 0) {
            return c.substring(nameEQ.length, c.length);
        }
    }
    return null;
}

function createCookie(name, value, expires) {
    //console.log('createCookie: ' + name + ", " + escape(value) + ", " + expires);
    if (readCookie(name) !== value) {
        document.cookie = name + "=" + escape(value) + "; path=/"+ ((expires == null) ? "" : "; expires=" + expires.toGMTString()); 
    }
}

function eraseCookie(name) {
    createCookie(name, "", -1);
}

function supportsLocalStorage() {
    try {
        return 'localStorage' in window && window['localStorage'] !== null;
    } catch (e) {
        return false;
    }
}

/**
 * Gets the value of a locally stored setting, such as the cyclingspeed
*/
function getItem(key) {
    if (!supportsLocalStorage()) { return readCookie(key); }
    var val = window.localStorage.getItem(key);
    return eval('(' + val + ')');
}

function setItem(key, value) {
    if (!supportsLocalStorage()) { createCookie(key, value); }
    try {
        value = JSON.stringify(value);
        if (getItem(key) === null) { 
            window.localStorage.setItem(key, value); 
        }
    } catch (e) {
        //toastMessage('Sorry, item cannot be saved.'); 
    }
    return true;
}

function removeItem(key) {
    if (!supportsLocalStorage()) { return eraseCookie(key); }
    try {
        window.localStorage.removeItem(key); 
    } catch (e) {
        //toastMessage('Sorry, item cannot be deleted.'); 
    }
}

function getRouteKeys() {
    if (!supportsLocalStorage()) { return false; }
    var ls = window.localStorage, routes = [], matched_route = {}, key, i;
    // Look through all our localStorage objects for routes. 
    for (i = 0; i < ls.length; i++) {
        key = ls.key(i);
        if (key.match(regexForRoutes) !== null) {
            routes.push(key);
        } 
    }
    // Sort by reverse ID.
    function compare(a,b) {
        var n1 = a.match(/\d+$/);
        n1 = parseInt(n1, 10);
        var n2 = b.match(/\d+$/);
        n2 = parseInt(n2, 10);
        if (n1 < n2) {
            return 1;
        } else {
            return -1;
        }
    }
    routes.sort(compare); 
    return routes;
}

function eraseRoutes() {
    if (!supportsLocalStorage()) { return false; }
    var all_keys = getRouteKeys(), i;
    for (i = 0; i < all_keys.length; i++) {
        window.localStorage.removeItem(all_keys[i]);
    }
    return true;
}

/*********************************************************
/ String-wrangling and conversion. 
*********************************************************/

if (typeof (String.prototype.trim) === "undefined") {
    String.prototype.trim = function () {
        return String(this).replace(/^\s+|\s+$/g, '');
    };
}

String.prototype.ellipsisText = function (maxCharacters) {
    var text = this;
    if (this.length > 0 && this.length > maxCharacters) {
        text = this.slice(0, maxCharacters - 3) + '...';
    }
    return text;
};

// Return querystring or hash params if present.
// Prioritise hash params over querystring. 
function getUrlVars() {
    var vars = [], delimiter, hash, hashes, i;
    delimiter = window.location.href.indexOf('#');
    if (delimiter !== -1) {
        hashes = window.location.href.slice(delimiter + 1).split('/');
        vars['r'] = hashes[0];
        if (hashes.length > 1) {
            vars['p'] = hashes[1];
        }
    } else { 
        delimiter = window.location.href.indexOf('?');
        if (delimiter !== -1) {
            hashes = window.location.href.slice(delimiter + 1).split('&');
            for (i = 0; i < hashes.length; i++) {
                hash = hashes[i].split('=');
                vars.push(hash[0]);
                vars[hash[0]] = hash[1];
            }
        }
    }
    return vars;
}

function secondsToMinutes(seconds) {
    var minutes = Math.floor(seconds / 60);
    seconds = seconds - (minutes * 60);
    if (seconds < 10) {
        seconds = "0" + seconds;
    }
    return (minutes + ":" + seconds);
}

function metresToMiles(metres) {
    var miles = metres * 0.000621;
    return miles.toFixed(2);
}

/**
* Convert speed in miles per hour to km/h, for the purposes of routing. 
*/
function kmph(mph) {
    switch (mph) {
    case 10:
        return 16;
    case 15:
        return 24;
    default:
        return 20;
    }
}

function gToKG(grammes) {
    if (grammes < 1001) {
        return grammes + "g";
    }
    return (grammes/1000).toFixed(2) + "kg";
}
function toTitleCase(str) {
    if (str !== null) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    } else { 
        return 'Not found';
    }
}

/*********************************************************
/ Everything map-related. 
*********************************************************/

//******************************************************
/* Get an individual photo.
/******************************************************/

function getIndividualPhoto(photo_id, caption) {
    //console.log('getIndividualPhoto');

    // Maplets have this form:
    // http://www.cyclestreets.net/location/34751/photomaplet34751zoom16.png
    var mapletUrl = 'http://www.cyclestreets.net/location/' + photo_id + '/photomaplet'+ photo_id + 'zoom';

    var photo_title = 'Photo from CycleStreets';
    var photo_url = CS_API + 'photo.json';
    var photodata = {};
    photodata['key'] = CS_API_KEY;
    photodata['id'] = photo_id
    // Get photo information - latlng etc.
    $.ajax({
        url: photo_url,
        data: photodata,
        dataType: 'jsonp',
        jsonpCallback: 'photo',
        success: function(data) {
           if (data.result.id!=undefined) {
               // Get URL, date etc. 
               $('#getting-photo').hide();  
               var image_url = data.result.imageUrl;
               if (typeof(data.result.caption)==='string') {
                    caption += data.result.caption;
               }
               var uploaded_by = data.result.username;
               var d = new Date(data.result.datetime*1000);
               var uploaded_on = d.getDate() + "/" + d.getMonth() + "/" + d.getFullYear();
               // Get the best size to display the photo. 
               var live_sizes = data.result.thumbnailSizes;
               live_sizes = live_sizes.split("|").reverse();
               var chosen_size = live_sizes[0];
               var viewPortWidth = 600, viewPortHeight=800;
               if (typeof window.innerWidth != 'undefined') {
                    viewPortWidth = window.innerWidth;
                    viewPortHeight = window.innerHeight;
               }
               $.each(live_sizes, function(i, val) { 
                    if (viewPortWidth > val) {
                        chosen_size = val;
                        return false;
                    }
               });
               image_url = image_url.replace('.jpg','-size' + chosen_size + ".jpg");
                $('#photo-image').attr({
                    src: image_url,
                    alt: caption,
                    title: caption
                });
                $('#photo-image').load(function() {
                    $('#loading-icon').hide();
                    //$('#photo-image').show();
                });
                $('#photo-header').text('Photo ' + data.result.id);
                caption += '<br/><em>Uploaded by ' + uploaded_by + " on " + uploaded_on + "</em>";
                $("a#twitter_link").attr("href", "http://twitter.com/?status=Great+photo+on+%40CycleStreets%21+http%3A%2F%2Fwww.cyclestreets.net%2Flocation%2F" + photo_id + "%2F");
                $("a#facebook_link").attr("href", "http://www.facebook.com/sharer/sharer.php?u=http%3A%2F%2Fwww.cyclestreets.net%2Flocation%2F" + photo_id + "%2F");
                $("a#permalink").attr("href", "http://www.cyclestreets.net/location/" + photo_id + "/");
                $('#social_links').show();
                $('#photo-caption').html(caption);

	       // Street, district and distant maplets
                $('#photomaplet16').attr({src: mapletUrl + '16.png'});
                $('#photomaplet13').attr({src: mapletUrl + '13.png'});
                $('#photomaplet10').attr({src: mapletUrl + '10.png'});

          } else {
              $('#photo-header').text('Sorry...');
              $('#photo-caption').html("Sorry, could not retrieve data for photo number " + photo_id + ".");
              $('#loading-icon').hide();
              $('#getting-photo').hide();
          }
        },
        error: function(data) {
            $('#photo-header').text('Sorry...');
            $('#photo-caption').html("Sorry, could not retrieve data for photo number " + photo_id + ".");
            $('#loading-icon').hide();
            $('#getting-photo').hide();
        }
   });
}

if (window.google) {

    // OSM/OCM/OS map types. 
    var osmMapType = new google.maps.ImageMapType({
        getTileUrl: function (coord, zoom) {
            return "http://tile.openstreetmap.org/" +
                zoom + "/" + coord.x + "/" + coord.y + ".png";
        },
        tileSize: new google.maps.Size(256, 256),
        isPng: true,
        alt: "OpenStreetMap layer",
        name: "OSM",
        maxZoom: 18
    });
    var ocmMapType = new google.maps.ImageMapType({
        getTileUrl: function (coord, zoom) {
            return "http://tile.opencyclemap.org/cycle/" +
                zoom + "/" + coord.x + "/" + coord.y + ".png";
        },
        tileSize: new google.maps.Size(256, 256),
        isPng: true,
        alt: "OpenCycleMap layer",
        name: "OCM",
        maxZoom: 18
    });
    var osMapType = new google.maps.ImageMapType({
        getTileUrl: function (coord, zoom) {
            return "http://c.os.openstreetmap.org/sv/" +
                zoom + "/" + coord.x + "/" + coord.y + ".png";
        },
        tileSize: new google.maps.Size(256, 256),
        isPng: true,
        alt: "Ordnance Survey layer",
        name: "OS",
        maxZoom: 17
    });

    // Check distance between two markers, used on route page. 
    google.maps.LatLng.prototype.distanceFrom = function (latlng) {
        var lat, lng, R, dLat, dLng, a, c, d;
        lat = [this.lat(), latlng.lat()];
        lng = [this.lng(), latlng.lng()];
        R = 6378137;
        dLat = (lat[1] - lat[0]) * Math.PI / 180;
        dLng = (lng[1] - lng[0]) * Math.PI / 180;
        a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat[0] * Math.PI / 180) * Math.cos(lat[1] * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        d = R * c;
        return Math.round(d);
    };

    // Parse coordinates from CycleStreets API, return array of latlngs. 
    function parseCoordinates(coord_list) {
        var routeCoordinates = [], j, coords, mylatlng;
        coords = coord_list.split(' ');
        $.each(coords, function (index, value) { 
            j = value.split(',');
            mylatlng = new google.maps.LatLng(parseFloat(j[1]), parseFloat(j[0]));
            routeCoordinates.push(mylatlng);
        });
        return routeCoordinates;
    }

    // Get map bounds from array of latlngs. 
    function findBounds(latlng_array) {
        var nbound = latlng_array[0].lat(), sbound = latlng_array[0].lat();
        var ebound = latlng_array[0].lng(), wbound = latlng_array[0].lng();
        var map_bounds;
        $.each(latlng_array, function (index, value) { 
            if (value.lat() > nbound) {
                nbound = value.lat();
            } else if (value.lat() < sbound) {
                sbound = value.lat();
            }
            if (value.lng() < ebound) {
                ebound = value.lng();
            } else if (value.lng() > wbound) {
                wbound = value.lng();
            }
        });
        map_bounds = new google.maps.LatLngBounds(new google.maps.LatLng(nbound, ebound), new google.maps.LatLng(sbound, wbound));
        return map_bounds;
    }

    // Create marker of appropriate type, used on route page. 
    function createMapMarker (location, marker_type) {

        var marker_icon; 
        marker_icon = new google.maps.MarkerImage(marker_type === "finish" ? '/images/cs_finish.png' : '/images/cs_start.png',
						  new google.maps.Size(50, 55),
						  new google.maps.Point(0, 0),
						  new google.maps.Point(13, 53));
	
        var map_marker = new google.maps.Marker({
            position: location, 
            map: map,
            icon: marker_icon,
            zIndex: 1000
        });
        return map_marker;
    }

    //******************************************************
    /* Geolocation-related functions.
    /******************************************************/

    function addPosMarker (lat, lng) {
        //console.log('addPosMarker');
        if (position_marker !== null) { 
            position_marker.setMap(null); 
        }
        var bluedot = new google.maps.MarkerImage('/images/blue-dot.png',
           new google.maps.Size(16, 16),
           new google.maps.Point(0,0),
           new google.maps.Point(8,8));
        mylatlng = new google.maps.LatLng(lat, lng);
        position_marker = new google.maps.Marker({
            position: mylatlng, 
            map: map,
            icon: bluedot,
            zIndex: 9999
        });
    }

    // We have found the user's location.
    function gpsSuccess(pos){
        //console.log('gpsSuccess');  
        if (pos.coords) { 
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
        }
        else {
            lat = pos.latitude;
            lng = pos.longitude;
        }
        if (window.google) {
            current_latlng = new google.maps.LatLng(lat, lng);
        } else {
            current_latlng = [lat, lng];
        }
        if ((global_page_type!=="new_route")&&(global_page_type!=="route_text")) {
            addPosMarker(lat, lng);
            $('#locate-me').show(); 
        }
        $('#getting-location').hide();
        if (is_user_position_initialised === false) {
            is_user_position_initialised = true;
            if (window.google) {
                setupMap(lat, lng);
            }
        }
    }   

    // We can't find the user's location. 
    function gpsFail(err) {  
        //console.log('gpsFail', err.code); 
        // Warn about errors IFF the user is not already located.
        if (is_user_position_initialised === false) {
            $('#locate-me').hide(); 
            current_latlng = new google.maps.LatLng(52.2025441, 0.1312368);
            if (err.code==1) {
                toastMessage('Using CycleStreets default location...');
                setupMap(52.2025441, 0.1312368);
            }      
            if (err.code==2) {
                toastMessage('Position unavailable, using CycleStreets default location...');
                setupMap(52.2025441, 0.1312368);
            }
            if (err.code==3) {
                toastMessage('Geolocation timeout error, using CycleStreets default location...');
                setupMap(52.2025441, 0.1312368);
            }
            if (err.code==0) {
                toastMessage('Unknown geolocation error, using CycleStreets default location...');
                setupMap(52.2025441, 0.1312368);
            }
        }
    }

    function stopTracking() {
        //console.log('stopTracking');
        //console.log('watchId: ' + watchId);
        if ((navigator.geolocation) && (watchId !== null)) {     
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
            if (position_marker !== null) { 
                position_marker.setMap(null); 
            }
        }
    }

    function removeMarkers() {
        for (i in photo_markers) {
          photo_markers[i].setMap(null);
        }
    }

    function addMarkers() { 
        //console.log('addMarkers');
        $.mobile.showPageLoadingMsg();
        var bounds = map.getBounds();
        var map_zoom = map.getZoom();
        var ne = bounds.getNorthEast();
        var sw = bounds.getSouthWest();
        var center = bounds.getCenter();
        var pm_url = CS_API + "photos.json"; 
        var pmdata = {};
        pmdata['key'] = CS_API_KEY;
        pmdata['longitude'] = center.lng();
        pmdata['latitude'] = center.lat();
        pmdata['n'] = ne.lat();
        pmdata['e'] = ne.lng();
        pmdata['s'] = sw.lat();
        pmdata['w'] = sw.lng();
        pmdata['zoom'] = map_zoom;
        pmdata['limit'] = 25;
        pmdata['suppressplaceholders'] = 1;
        pmdata['minimaldata'] = 1;
        pmdata['thumbnailsize'] = 200;  
        removeMarkers();
        $.ajax({
           url: pm_url,
           crossDomain: true, 
           dataType: 'jsonp',
           data: pmdata,
           success: function(data) {
               if (data.marker!==undefined) {
                   // We have some results. 
                   function addNewMarker(v) { 
                       var marker = v['@attributes'];
                       if ($(marker).length > 0) {
                           var marker_latlng = new google.maps.LatLng(marker.latitude, marker.longitude);
                           var map_marker = new google.maps.Marker({
                             position: marker_latlng,
                             title: marker.caption,
                             icon: '/images/photomap.png'
                           });
                           map_marker.setMap(map);                           
                           google.maps.event.addListener(map_marker, 'click', function() {
                               current_marker = marker.id;
                               $.mobile.changePage( "#photo", {
                               	transition: "pop",
                               	changeHash: false
                               });
                           });
                           photo_markers.push(map_marker);
                       }
                   }   
                   // We may have one marker as a dict, or many as an array.
                   if (data.marker.length!==undefined) {
                       $.each(data.marker, function(i,v) {
                           addNewMarker(v);
                       });           
                   } else {
                       addNewMarker(data.marker);
                   }
                   $.mobile.hidePageLoadingMsg();
               } else {
                  // Empty results. 
                  $.mobile.hidePageLoadingMsg();
                  if (global_page_type=="photomap") {
                      toastMessage("No photos found in this area - try zooming out");       
                  } 
            }
           },
           error: function() {
               $.mobile.hidePageLoadingMsg();
               toastMessage("Sorry, error retrieving photos!");
           }
        });
    }

    //******************************************************
    /* Routing functions.
    /******************************************************/    

    // Get a route from an existing itinerary
    function routeFromExistingItinerary(route_id, plan) {
	routeWithCycleStreets(null, route_id, plan);
    }

    // Route journey using CycleStreets API, display map. 
    function routeStartFinishWithCycleStreets(start_lat, start_lng, finish_lat, finish_lng) {

	// Check end points are set
        if ((start_lat===undefined) || (start_lng===undefined) || (finish_lat===undefined) || (finish_lng===undefined)) { 
            toastMessage("Sorry, there's a problem with the route markers. Please refresh page and try again.");
            return;
        }
	routeWithCycleStreets(start_lng + ',' + start_lat + '|' + finish_lng + ',' + finish_lat, null, null);
    }

    // Plan route using itinerary markers (currently expects just two markers)
    function routeItineraryMarkersWithCycleStreets(itineraryMarkers) {
	routeWithCycleStreets(itineraryMarkers[0].position.lng() + ',' + itineraryMarkers[0].position.lat() + '|' + itineraryMarkers[1].position.lng() + ',' + itineraryMarkers[1].position.lat(),null,null);
    }

    // Route journey using CycleStreets API, display map. 
    function routeWithCycleStreets(itineraryPoints, route_id, plan) {

	// Trace
	// console.log('routeWithCycleStreets(' + itineraryPoints + ', ' + route_id + ', ' + plan + ')');

	// Animation that shows the page is loading
        $.mobile.showPageLoadingMsg();

	// Hide the main buttons
        $('#waypointAdd').hide();
        $('#waypointDel').hide();

	// Update title
        $('#route-header').text("Fetching route...");

	// API url for journey planning
        var journey_url = CS_API + 'journey.json';

	// Start an array of journey planner data
        var journeydata = {};

	// Add the API key
        journeydata['key'] = CS_API_KEY;

	// Speed of cycling (a global), read from the prefs page
        speedMph = getItem("cyclingspeed");
        if (speedMph==null) {
          speedMph = "12";
        }

	// Has an existing route id been requested?
        if (route_id!==null) {

            // Set the parameters to ask for the existing route
            journeydata['itinerary']=route_id;
            journeydata['plan']=plan;

        } else {

	    // Arrange the parameters to plan a new route
            journeydata['itinerarypoints'] = itineraryPoints;
            if (plan===null) {
		// Default the route plan to the value in the prefs, else use balanced
		plan = getItem("plan")!==null ? getItem("plan") : 'balanced';
            }  
            journeydata['plan'] = plan;
            journeydata['speed'] = kmph(speedMph);
        }

	// Request the route
        $.ajax({
            url: journey_url,
            data: journeydata,
            dataType: 'jsonp',
            jsonpCallback: 'journey',
            success: function(data) {
                if (($(data).length > 0) ){ //&& (data.marker !== undefined
                    route_data = data;
                    var markers = route_data.marker;
                    if (markers!==undefined) {
                    // Get route information. 
                    //console.log(markers[0]['@attributes']);
                    var coordinates = markers[0]['@attributes'].coordinates;
                    var route_from = markers[0]['@attributes'].start;
                    var route_to = markers[0]['@attributes'].finish;
                    var returned_id = markers[0]['@attributes'].itinerary;
                    var start_lat = markers[0]['@attributes'].start_latitude;
                    var start_lng = markers[0]['@attributes'].start_longitude;
                    var finish_lat = markers[0]['@attributes'].finish_latitude;
                    var finish_lng = markers[0]['@attributes'].finish_longitude;
                    var startlatlng = new google.maps.LatLng(start_lat, start_lng);
                    var finishlatlng = new google.maps.LatLng(finish_lat, finish_lng);

                    // Set up map, if we haven't already, and markers.
                    if (map===undefined) {

                        setupMap(start_lat, start_lng);

			// #waypoints Add all the waypoints
			// Note this may be un-necessary (but non-problematic) duplication as the markers may already be present - if done by route on map.
			createMapMarker(startlatlng, 'start');
			createMapMarker(finishlatlng, 'finish');    
                    }

                    // Show route summary information. 
                    var route_distance = markers[0]['@attributes'].length;
                    var route_time = markers[0]['@attributes'].time;
                    var co2g = markers[0]['@attributes'].grammesCO2saved;
                    var calories = markers[0]['@attributes'].calories;
                    $('#route-header').text(toTitleCase(plan) + ": " + secondsToMinutes(route_time) + ' min');
                    var summary_html = metresToMiles(route_distance) + ' miles at ' + speedMph + ' mph<br/>';
                    summary_html += calories + " kcal, " + gToKG(co2g) + " CO<sub>2</sub> saved"
                    $('#summary').html(summary_html);
                    $('#prev-segment').hide();
                    var route_id = markers[0]['@attributes'].itinerary;

                    // Save in localStorage.
                    var ls_name = 'route-' + route_id;
                    var ls_values = {};
                    ls_values['from'] = route_from;
                    ls_values['to'] = route_to;
                    ls_values['time'] = secondsToMinutes(route_time);
                    ls_values['distance'] = metresToMiles(route_distance);
                    ls_values['plan'] = journeydata['plan'];
                    ls_values['speed'] = speedMph;
                    ls_values['date'] = new Date();
                    setItem(ls_name,ls_values);

                    // Update hash and header.
                    document.title = 'CycleStreets \u00bb ' + toTitleCase(journeydata['plan']) + ' route from ' + route_from + ' to ' + route_to;
                    window.location.hash = route_id + '/' + journeydata['plan'];

                    // Draw map route and set map bounds. 
                    var coords = parseCoordinates(coordinates);
                    if (routePath!==null) {
                       routePath.setMap(null);
                    }
                    if (individualPath!==null) {
                       individualPath.setMap(null);
                    }
                    routePath = new google.maps.Polyline({
                      path: coords,
                      strokeColor: "#CC33FF",
                      strokeWeight: 3
                    });     
                    // Add turn-by-turn instructions.
                    var turnByTurnInstructions = markers.slice(1);
                    var turnByTurnArray = [];
                    $(turnByTurnInstructions).each(function(){
                        var segment = {};
                        segment['name'] = this['@attributes'].name;
                        segment['time'] = this['@attributes'].time;
                        segment['distance'] = this['@attributes'].distance;
                        segment['provision'] = this['@attributes'].provisionName;
                        segment['turn'] = toTitleCase(this['@attributes'].turn);
                        segment['flow'] = this['@attributes'].flow;
                        segment['walk'] = this['@attributes'].walk;
                        segment['points'] = this['@attributes'].points;
                        turnByTurnArray.push(segment); 
                    });
                    // Show turn-by-turn directions.
                    $('#instructions-footer').show();
                    $('#direction').show();
                    var num = -1;
                    function updateSegment(n) {
                        $('#next-segment .ui-btn-text').text('Next');
                        if (n>0) {
                            $('#prev-segment').show();

                        } else {
                            $('#prev-segment').hide();
                        }
                        if (n<turnByTurnArray.length-1) {
                            $('#next-segment').show();
                        } else {
                            $('#next-segment').hide();
                        }
                        $('#summary').hide();
                        var segtext = turnByTurnArray[n]['turn'] + " at " + turnByTurnArray[n]['name'];
                        segtext += '<br/>Continue for ' + turnByTurnArray[n]['distance'] + "m";
                        $('#individualsegment').html(segtext);
                        $('#individualsegment').show();
                        if (individualPath!==null) {
                           individualPath.setMap(null);
                        }
                        var individualCoords = parseCoordinates(turnByTurnArray[num]['points']);
                        individualPath = new google.maps.Polyline({
                          path: individualCoords,
                          strokeColor: "blue",
                          strokeWeight: 3
                        });     
                        individualPath.setMap(map);
                        map.fitBounds(findBounds(individualCoords));
                    }
                    $('#next-segment').click(function() {
                        num++;
                        updateSegment(num);
                    });
                    $('#prev-segment').click(function() {
                        num--;
                        updateSegment(num)
                    });
                    $('#navbar-options').hide();
                    $('#crosshairs').hide();
                    $('#navbar-plan').show();   
                    //addPosMarker();
                    routePath.setMap(map);
                    var window_height = $(window).height() - $("div:jqmData(role='header')").first().outerHeight();
                    if ($('#instructions-footer').is(":visible")) {
                        window_height = window_height - ($("#instructions-footer").outerHeight()); //($("div:jqmData(role='footer')").first().outerHeight()*2);
                    }
                    $("div:jqmData(role='content')").first().height(window_height);
                    $("#map-canvas").height(window_height);
                    map.fitBounds(findBounds(coords));

                    // Bind each plan type to lookup.  
                    $('a#' + plan).addClass('ui-btn-active');
                    if ($('a#fastest').data("events")===undefined){
                        $("a#fastest").bind('tap', function(e){  
                             e.preventDefault();
                             $.mobile.showPageLoadingMsg();
                             routeFromExistingItinerary(route_id,'fastest'); } );  
                    }
                    if ($('a#balanced').data("events")===undefined){                
                        $("a#balanced").bind('tap', function(e){ 
                            e.preventDefault();
                            $.mobile.showPageLoadingMsg();
                             routeFromExistingItinerary(route_id,'balanced');} );
                    }
                    if ($('a#quietest').data("events")===undefined){
                        $("a#quietest").bind('tap', function(e){  
                            e.preventDefault();
                            $.mobile.showPageLoadingMsg();
                            routeFromExistingItinerary(route_id,'quietest');
                            return false; });
                   }
                    global_page_type = "existing_route";

                    // Check before leaving page now. 
                    $('#home-button').unbind('click');
                    $('#home-button').click(function() { 
                        return confirm('Leave route? You can find it again in your saved routes.');
                    });
                    $.mobile.hidePageLoadingMsg();
                    return true;
                } else {
                    toastMessage("Sorry, unable to find route!");
                    $('#route-header').text("Routing problem");
                    $('#getting-location').html("<p>Sorry, please try again.</p>");
                    $.mobile.hidePageLoadingMsg();
                    return false;                   
                }
                } else {
                    toastMessage("Sorry, unable to find route!");
                    $('#route-header').text("Routing problem");
                    $('#getting-location').html("<p>Sorry, please try again.</p>");
                    $.mobile.hidePageLoadingMsg();
                    return false;                    
                }
            },
            error: function(data) {
                toastMessage("Sorry, there's a problem with the routing server.");
                $('#route-header').text("Routing problem");
                $('#getting-location').html("<p>Sorry, please try again.</p>");
                $.mobile.hidePageLoadingMsg();
                return false;
            }
        });
    }

    // Look up individual address from the CycleStreets geocoder. 
    function geocode(address, geodata, route_type) {
        //console.log('geocode', address, geodata);
        geodata['street'] = address;
        return $.ajax({
            url: CS_API + 'geocoder.json',
            crossDomain: true, 
            data: geodata,
            dataType: 'jsonp',
            success: function(from_data) {
                if (from_data.results.result!==undefined){
                   var from_result = from_data.results.result;
                   if (from_result.length===undefined) {
                       if (route_type=="start") {
                           start_coords = [parseFloat(from_result.latitude), parseFloat(from_result.longitude)];
                       } else {
                           finish_coords = [parseFloat(from_result.latitude), parseFloat(from_result.longitude)];
                       } 
                   } else {
                       if (route_type=="start") {
                           start_coords = [parseFloat(from_result[0].latitude), parseFloat(from_result[0].longitude)];   
                       } else {
                           finish_coords = [parseFloat(from_result[0].latitude), parseFloat(from_result[0].longitude)];
                       }
                       return true;
                  }
                } else {
                    toastMessage("Sorry, unable to geocode " + address);
                    $.mobile.hidePageLoadingMsg();
                    return false;
                }
            },
            error: function(data) {
                toastMessage("Sorry, there's a problem with the geocoding server.");
                $.mobile.hidePageLoadingMsg();
                return false;
            }   
        }); 
    }

    /**
     * This function supports the route by address feature at /#route-by-address
     */
    function geocodeWithCycleStreets(place_from,place_to) {

	// Trace
        // console.log('geocodeWithCycleStreets');

	// Check from / to args
        if ((place_from=='')||(place_to=='')) {

	    // If the current location is not known then empty locations cannot be defaulted
	    // !! It is not clear how this ever gets set properly.
            if (current_latlng==null) {
                toastMessage('Sorry, location not found, please try again in a few seconds.');
                $.mobile.hidePageLoadingMsg();
                return;
	    }

	    // Use the current location for the unspecified end
            if (place_from=='') {
                start_coords = [current_latlng[0], current_latlng[1]];  
            } else {
                finish_coords = [current_latlng[0], current_latlng[1]];         
            }
        }

        // The geocoder doesn't absolutely require these values,
        //  but add them if we do have a location fix. 
        if (current_latlng!==null) {
            geodata['n'] = current_latlng[0] + 0.1;
            geodata['e'] = current_latlng[1] + 0.1;
            geodata['s'] = current_latlng[0] - 0.1;
            geodata['w'] = current_latlng[1] - 0.1;
        }
        if (place_from=='') {
            $.when(geocode(place_to,geodata,'finish')).then(function(){
                window.location = '/journey/?s_lat=' + start_coords[0] + '&s_lng=' + start_coords[1] +  
                                        '&f_lat=' + finish_coords[0] + '&f_lng=' + finish_coords[1]; });
        } else if (place_to=="") {
            $.when(geocode(place_from,geodata,'start')).then(function(){  
                window.location = '/journey/?s_lat=' + start_coords[0] + '&s_lng=' + start_coords[1] +  
                                        '&f_lat=' + finish_coords[0] + '&f_lng=' + finish_coords[1]; });
        } else {
            $.when(geocode(place_from,geodata,'start'),geocode(place_to,geodata,'finish')).then(function(){
                window.location = '/journey/?s_lat=' + start_coords[0] + '&s_lng=' + start_coords[1] +  
                                        '&f_lat=' + finish_coords[0] + '&f_lng=' + finish_coords[1]; });
        }
        return true;
    }

    // CSS for crosshairs. 
    function createCrosshairs() { 
        var img = $("#crosshairs_img"); 
        // Only use large crosshairs in browsers known to support pointer-events CSS property.
        var ua = navigator.userAgent;
        if ((ua.indexOf("Firefox") !== -1) || (ua.indexOf("Fennec") !== -1) || (ua.indexOf("Chrome") !== -1)
            || (ua.indexOf("WebKit") !== -1)) {
            $(img).attr('src', '/images/crosshairs.png');
        }
        var map_height = $('#map-canvas').height();
        if (map_height!==0) {
            $("<img/>")
                .attr("src", $(img).attr("src"))
                .load(function() {
                    pic_real_width = this.width;   
                    pic_real_height = this.height; 
                    var top_position = (($("div#map-canvas").height() - pic_real_height) / 2) + $("div:jqmData(role='header')").first().outerHeight();
                    var left_position = ($("div#map-canvas").width() - pic_real_width) / 2;
                    $('#crosshairs_img').css({
                        'position': 'absolute',
                        'top': top_position,
                        'left': left_position,
                        'margin': 0,
                        'padding': 0,
                        'z-index': '1000'
                    });
                });
            $('#crosshairs').show();
        }
    }

    // Set up the map and its listeners, once we know its centre. 
    function setupMap(lat, lng) {

	// Trace
        // console.log('setupMap');

        // Check if we know the user's recent location: use that instead, if it exists.
        var mapzoom = 14;
        var last_location_known = readCookie('map_last_location');
        if (last_location_known != null) {
            toastMessage("Using your most recent location...");
            var loadedstring = readCookie("map_last_location"); 
            var splitstr = loadedstring.split("_"); 
            lat = parseFloat(splitstr[0]);
            lng = parseFloat(splitstr[1]);
            mapzoom = parseFloat(splitstr[2]); 
        }

	// Hide message
        $('#getting-location').hide();

        // Basic setup. 
        var myOptions = {
            zoom: mapzoom,
            center: new google.maps.LatLng(lat, lng),
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            panControl: false,
            zoomControl: true,
            streetViewControl: false,
            zoomControlOptions: {
                position: google.maps.ControlPosition.LEFT_TOP
            },
            mapTypeControlOptions: {
              mapTypeIds: ['OSM', 'OCM', 'OS'],
              style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
              position: google.maps.ControlPosition.RIGHT_TOP }
        };

	// Bind the map global
        map = new google.maps.Map(document.getElementById("map-canvas"),myOptions);

        // Map types. 
        map.mapTypes.set('OSM',osmMapType);
        map.mapTypes.set('OCM',ocmMapType);
        map.mapTypes.set('OS',osMapType); 

	// Setup desired map style from preferences
        var desired_map = getItem("maptype")==null ? "OSM" : getItem("maptype");

        map.setMapTypeId(desired_map);   
        google.maps.event.addListener(map, 'maptypeid_changed', function() { 
            setItem("maptype", this.getMapTypeId());
        });

        // Geolocate button: toggle geotracking. 
        $("#locate-me").bind('tap', function(e){ 
            if (watchId !== null) {
                toastMessage('No longer tracking your location');
                $("#locate-me span.ui-icon").addClass("ui-icon-minus").removeClass("ui-icon-plus");
                $("#locate-me .ui-btn-text").text("Loc: Off");
                stopTracking();
            } else {
                toastMessage('Tracking your location');
                watchId = navigator.geolocation.watchPosition(gpsSuccess,
                      gpsFail, {timeout:10000, maximumAge: 300000}); 
                if (current_latlng!==null) {
                    map.panTo(current_latlng);
                    addPosMarker(current_latlng.lat(), current_latlng.lng());
                }
                $("#locate-me span.ui-icon").addClass("ui-icon-plus").removeClass("ui-icon-minus");
                $("#locate-me .ui-btn-text").text("Loc: On");
            }
            return false;
        });
        // If we are on a page that requires geolocation, add markers etc.
        if (global_page_type !== "new_route") {  
            if ((current_latlng !== null) && (is_user_position_initialised !== false)) {
                addPosMarker(current_latlng.lat(), current_latlng.lng());
                $('#locate-me').show();
            } else { 
                $('#locate-me').hide();
            }
        }
        // If we are on the photomap page, add markers. 
        if (global_page_type==="photomap") {    
            google.maps.event.addListener(map, 'tilesloaded', function() {
              addMarkers();
            });
            $('#photo').live('pageshow', function (event, ui) { 
                getIndividualPhoto(current_marker, '');
            });
        }
        // Add an event listener: save latest location, so we can reload it if the user navigates away from the page. 
        google.maps.event.addListener(map, 'tilesloaded', function() {
            var mapcenter=map.getCenter(); 
            var cookiestring = mapcenter.lat() + "_" + mapcenter.lng() + "_" + map.getZoom(); 
            var exp = new Date(); //set new date object 
            exp.setTime(exp.getTime() + (1000 * 60 * 5)); //set it 5 minutes ahead
            createCookie("map_last_location",cookiestring, exp); 
        });

	// When the map is moved
	/* Unfinished wip
	google.maps.event.addListener(map, 'center_changed', function() {

	    // Nothing to do if there are no markers
	    if (!itineraryMarkers.length) {return;}

            // Check the new position is not too close to the last
            var dist = itineraryMarkers[itineraryMarkers.length - 1].position.distanceFrom(map.getCenter());
            if (dist < 200) {

		// Change the waypointAdd button to 'Move the map' first time around, and subsequently 'Tap to route'
                console.log('Too close');
	    } else {

		// Change the waypointAdd button to 'Tap to add point'
                console.log('OK');
	    }

	});*/

	// Click function for the 'Tap to set start' button sets up the 'New route page'.
        // If we are on a new route page, add reticle and listeners. 
        $('#waypointAdd').click(function() {

	    // If end points are set plan a route.
	    // #waypoints Will need a new button to distinguish bewteen planning a route and adding further waypoints.
	    if (itineraryMarkers.length > 1) {
                 $('#route-header').text('Getting route...');
                 routeItineraryMarkersWithCycleStreets(itineraryMarkers);
		 return;
              }

	    // If just the start has been set add a finish
	    if (itineraryMarkers.length > 0) {

		// The new position
		var waypointPosition = map.getCenter();

                // Check the new position is not too close to the last
                var dist = itineraryMarkers[itineraryMarkers.length - 1].position.distanceFrom(waypointPosition);
                if (dist < 200) {
                    toastMessage('Sorry, those points are too close together!');

		    // Exit
                    return;
                }

                // Add finish point
		itineraryMarkers.push(createMapMarker(waypointPosition, 'finish'));

		// Setup the button to offer route planning
                $('#waypointAdd .ui-btn-text').text(COMPLETE_ROUTE);
                $('#waypointAdd').css({
                    'left': ($('#map-canvas').width() - $('#waypointAdd').width()) / 2
                });
                $('#waypointAdd').show(); 

                // Set up the 'remove marker' button.
                $('#waypointDel').unbind('click');
                $('#waypointDel .ui-btn-text').text('Undo');
                $('#waypointDel').show();
                $('#waypointDel').click(function() { 

		    // Remove the last waypoint
		    if (itineraryMarkers.length > 0) {

			removeLastMarker();

                        $('#waypointDel .ui-btn-text').text('Remove start point');
                        $('#waypointDel').click(function() { 

			    // Remove the latest marker
			    removeLastMarker();

                            $(this).hide();			    
                            $('#waypointAdd .ui-btn-text').text(SET_FIRST_MARKER);
                            $('#waypointAdd').css({
                                'left': ($('#map-canvas').width() - $('#waypointAdd').width()) / 2
                            });
                        });
                    }

                    $('#waypointAdd .ui-btn-text').text(SET_SECOND_MARKER);
                    $('#waypointAdd').css({
                        'left': ($('#map-canvas').width() - $('#waypointAdd').width()) / 2
                    });
                });
		// Exit
		return;
                }

            // Add start marker
	    itineraryMarkers.push(createMapMarker(map.getCenter(), 'start'));

            $('#waypointAdd .ui-btn-text').text(SET_SECOND_MARKER);
            $('#waypointAdd').show(); 

            // Set up the 'remove marker' button.
            $('#waypointDel').show();
            $('#waypointDel').unbind('click');
            $('#waypointDel').click(function() { 
		// Remove the latest marker
		removeLastMarker();

                $(this).hide();
                $('#waypointAdd .ui-btn-text').text(SET_FIRST_MARKER);
            });
	});

	// ???
        if (global_page_type=="new_route") {
            createCrosshairs();
            $('#waypointAdd').show();
        }
    }

    // Remove the latest marker
    function removeLastMarker () {

	// Skip if empty
	if (!itineraryMarkers.length) {return;}

	// Remove the latest marker
	var lastItineraryMarker = itineraryMarkers.pop();

	// Remove from map
	lastItineraryMarker.setMap(null);
    }

// Close the if (window.google)
}

//******************************************************
/* Page layout and setup. 
/******************************************************/

// Called on init and on window resize. 
function organizeCSS(page_type) {
    //console.log('organizeCSS');
    var window_height;
    $("div:jqmData(role='page')").first().height($(window).height());
    if (page_type === "photomap") {
        $('#instructions-footer').hide();
        $('#navbar-plan').hide();
        window_height = $(window).height() - $("div:jqmData(role='header')").first().outerHeight();
        $("div:jqmData(role='content')").first().height(window_height);
        $("#map-canvas").height(window_height);
        $('#route-header').text('Photos near me');
        document.title = 'CycleStreets \u00bb Photos near me';
    } else if ((page_type === "new_route") || (page_type === "existing_route")) {
        if (global_page_type === "new_route") {
            $('#navbar-plan').hide();
            $('#instructions-footer').hide();
            createCrosshairs();
            document.title = 'CycleStreets \u00bb Route on map';     
        } else {
            $('#navbar-plan').show();
            $('#instructions-footer').show();       
        }
        window_height = $(window).height() - $("div:jqmData(role='header')").first().outerHeight();
        if ($('#instructions-footer').is(":visible")) {
            window_height = window_height - $("div:jqmData(role='footer')").first().outerHeight();
        }
        $("div:jqmData(role='content')").first().height(window_height);
        $("#map-canvas").height(window_height);
        var left_margin = ($('#map-canvas').width() - $('#waypointAdd').width()) / 2;
        if (left_margin < 0) { 
            left_margin = 10;
        }
        $('#waypointAdd').css({
            'position': 'absolute',
            'top': window_height - 20,
            'left': left_margin,
            'z-index': '1000',
            'color' : 'black'
        });
        left_margin = ($('#map-canvas').width() - $('#waypointDel').width()) / 2;
        if (left_margin < 0) { 
            left_margin = 10;
        }
        $('#waypointDel').css({
            'position': 'absolute',
            'top': $("div:jqmData(role='header')").first().height() + 40,
            'left': left_margin,
            'z-index': '1000',
            'color' : 'red'
        });
    }
}

function setUpPage(page_type) {

    // Delete redirection cookie, if it exists. 
    document.cookie = "nomobileredirect=-1;domain=.cyclestreets.net;path=/";

    global_page_type = page_type;

    if (global_page_type === "route") {
        var getparams = getUrlVars();
        var route_id = getparams['r'];
        if (route_id !== undefined) {
            var plan = 'balanced';
            if (getparams['p']!==undefined) {
                plan = getparams['p'];
            }
            global_page_type = "existing_route";
            is_user_position_initialised = true;
            routeFromExistingItinerary(route_id,plan);
        } else if ((getparams['s_lat'] !== undefined) && (getparams['s_lng'] !== undefined) && (getparams['f_lat'] !== undefined) && (getparams['f_lng'] !== undefined)){ 
            global_page_type = "existing_route";
            is_user_position_initialised = true;
            routeStartFinishWithCycleStreets(getparams['s_lat'],getparams['s_lng'],getparams['f_lat'],getparams['f_lng']);
        } else {
            global_page_type = "new_route";
        }
    }

    if (navigator.geolocation) { 
        toastMessage('Getting your location...');
        watchId = navigator.geolocation.watchPosition(gpsSuccess,
              gpsFail, {timeout:10000, maximumAge: 300000});
    } else {
        toastMessage("Sorry, can't get your current location!");
        // Use default location of Cambridge. 
        setupMap(52.2025441, 0.1312368);
    }

    // Set up CSS after page load. 
    $('#home').live('pageshow', function (event, ui) {
        organizeCSS(global_page_type);
    });

    // Re-render CSS if the user changes window size. 
    $(window).resize(function() {
      organizeCSS(global_page_type);
    });
}
