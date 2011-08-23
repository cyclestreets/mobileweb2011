var CS_API_KEY = '68f786d958d1dbfb';
var CS_API = 'http://www.cyclestreets.net/api/';
var COOKIE_EXPIRY_TIME = 1000;
var DEFAULT_ROUTE_TYPE = "balanced";
var DEFAULT_SPEED = "12";
var routexml;
var regexForRoutes = /^route-[\d]+$/; 
var SET_FIRST_MARKER = '1. Click to set start';
var SET_SECOND_MARKER = '2. Click to set end';
var GET_ROUTE = '3. Click here to route!';
var watchId;
var map;
var route_data;
var current_latlng = null;
var routePath = null;
var individualPath = null;
var routetype = null;
var speed = null;
var photo_markers = [];
//var start_marker = null;
//var finish_marker = null;
var start_point = null;
var finish_point = null;
var position_marker = null;

/*********************************************************
/ Generic code to create/read/erase cookies.
/ Cookies are only used if localStorage is not supported.
*********************************************************/

function createCookie(name,value) {
    if (readCookie(name)!=value) {
     document.cookie = name+"="+value+"; path=/";
    }
}

function readCookie(name) {
 var nameEQ = name + "=";
 var ca = document.cookie.split(';');
 for(var i=0;i < ca.length;i++) {
     var c = ca[i];
     while (c.charAt(0)==' ') c = c.substring(1,c.length);
     if (c.indexOf(nameEQ) == 0) {
         return c.substring(nameEQ.length,c.length);
     }
 }
 return null;
}

function eraseCookie(name) {
 createCookie(name,"",-1);
}

/*********************************************************
/ Store items in localStorage. 
*********************************************************/

function supportsLocalStorage() {
  try {
    return 'localStorage' in window && window['localStorage'] !== null;
  } catch (e) {
    return false;
  }
}

function setItem(key,value) {
    if (!supportsLocalStorage()) { createCookie(key,value); }
    try {
         value = JSON.stringify(value);
    	 localStorage.setItem(key, value); 
    	 //console.log('setItem: ' + key + " " + value);
    } catch (e) {
    	 if (e == QUOTA_EXCEEDED_ERR) {
    	 	 toastMessage('Sorry, local storage quota exceeded! Item cannot be saved.'); //data wasn't successfully saved due to quota exceed so throw an error
    	}
    }
    return true;
}

function getItem(key) {
    if (!supportsLocalStorage()) { return readCookie(key); }
    var val = window.localStorage.getItem(key);
    return eval('(' + val + ')');
}

function getRouteKeys() {
    if (!supportsLocalStorage()) { return false; }
    var ls = localStorage, key;
    var routes = [], matched_route = {};
    for (var i = 0; i < ls.length; i++) {
        key = ls.key(i);
        if (key.match(regexForRoutes)!=null) {
            //console.log('matching key found: ' + key);
            routes.push(key);
        } 
    }
    //console.log('found matching routes ' + routes);
    return routes;
}

function eraseRoutes() {
    if (!supportsLocalStorage()) { return false; }
    var all_keys = getRouteKeys();
    for (var i = 0; i < all_keys.length; i++) {
        localStorage.removeItem(all_keys[i]);
    }
    return true;
}

/*********************************************************
/ Generic string-wrangling and conversion functions. 
*********************************************************/

if(typeof(String.prototype.trim) === "undefined")
{
    String.prototype.trim = function() 
    {
        return String(this).replace(/^\s+|\s+$/g, '');
    };
}
String.prototype.ellipsisText = function(maxCharacters) {
    var text = this;
    if (this.length > 0 && this.length > maxCharacters) {
        text = this.slice(0, maxCharacters - 3) + '...';
    }
    return text;
}

function getUrlVars()
{
    var vars = [], hash;
    var delimiter = window.location.href.indexOf('?');
    if (delimiter===-1) {
	    delimiter = window.location.href.indexOf('#');
    }
    var hashes = window.location.href.slice(delimiter + 1).split('&');
    for(var i = 0; i < hashes.length; i++)
    {
        hash = hashes[i].split('=');
        vars.push(hash[0]);
        vars[hash[0]] = hash[1];
    }
    return vars;
}

function secondsToMinutes(seconds) {
    var minutes = Math.floor(seconds/60);
    seconds = seconds-(minutes*60);
    if (seconds < 10) {
        seconds = "0" + seconds;
    }
    return(minutes + ":" + seconds)
}

function metresToMiles(metres) {
    var miles = metres * 0.000621;
    return miles.toFixed(2);
}

function kmToMph(kph, mph) {
    if (kph!=null) {
      switch (kph) {
        case 16:
          return 10
        case 24:
          return 15;
        default:
          return 12;    
      }    
    } else {
        switch (mph) {
        case 10:
          return 16
        case 15:
          return 24;
        default:
          return 20;
        }
    }
}

function toTitleCase(str) {
    if (str!=null) {
          //return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
          return str.charAt(0).toUpperCase() + str.slice(1);
    } else { 
        return 'Not found';
    }
}

/*********************************************************
/ Styled popup (toast) messages.
*********************************************************/

function toastMessage(msg) {
    var msg_text ="<div class='ui-loader ui-overlay-shadow ui-body-e ui-corner-all'>";
    msg_text += "<h1>" + msg + "</h1></div>";
    $(msg_text).css({ "display": "block", "opacity": 0.96, "top": $(window).scrollTop() + 150 })
    .appendTo( $.mobile.pageContainer )
    .delay( 1500 )
    .fadeOut( 400, function(){
        $(this).remove();
    });
}

//******************************************************
/* Confirm before leaving an uncompleted route.
/******************************************************/

function confirmBeforeLeaving() {
    window.onbeforeunload = function () {
       return "Leave route?";
    }
}

/*********************************************************
/ Map functions.
*********************************************************/

if (window.google) {
	var bluedot = new google.maps.MarkerImage('images/blue-dot.png',
	   new google.maps.Size(16, 16),
	   new google.maps.Point(0,0),
	   new google.maps.Point(8,8));	
	// OSM/OCM/OS map types. 
	var osmMapType = new google.maps.ImageMapType({
	   getTileUrl: function(coord, zoom) {
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
	   getTileUrl: function(coord, zoom) {
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
	   getTileUrl: function(coord, zoom) {
	                   return "http://c.os.openstreetmap.org/sv/" +
	   zoom + "/" + coord.x + "/" + coord.y + ".png";
	               },
	   tileSize: new google.maps.Size(256, 256),
	   isPng: true,
	   alt: "Ordnance Survey layer",
	   name: "OS",
	   maxZoom: 17
	});
	
	
	//******************************************************
    /* Geolocation-related functions.
    /******************************************************/
    function addPosMarker(mylatlng) {
		if (position_marker!=null) { 
		    position_marker.setMap(null); 
		}
        position_marker = new google.maps.Marker({
            position: mylatlng, 
            map: map,
            icon: bluedot
        });	
    }
    function watchingLoc(pos){
        if (pos.coords) { 
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
        else {
          lat = pos.latitude;
          lng = pos.longitude;
        }
        current_latlng = new google.maps.LatLng(lat, lng);
        addPosMarker(current_latlng);
    }	
    function failedLoc() { 
	    toastMessage("Sorry, can't get your current location!");
        $('#locate-me').hide();
	}
    function trackPosition() {
	    stopTracking();
	    if (navigator.geolocation) {
	        watchId = navigator.geolocation.watchPosition(watchingLoc, failedLoc, {enableHighAccuracy:true, maximumAge:30000, timeout:27000});
        }
    }
    function stopTracking() {
	    if ((navigator.geolocation) && (watchId!=null)) {	    
		    navigator.geolocation.clearWatch(watchId);
	    }
		if (position_marker!=null) { 
		    position_marker.setMap(null); 
		}
    }
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
	  latlng = new google.maps.LatLng(lat, lng);
	  //console.log(latlng);
	  setupMap(latlng, 'photomap');
	}	
	function gpsFail(page_type){     
	 //console.log('gpsFail');             
	 toastMessage("Sorry, can't get your current location!");
	 // Default location: Cambridge
	 var lat = 52.2025441, lng = 0.1312368;
	 var latlng = new google.maps.LatLng(lat, lng);
	 setupMap(latlng, page_type);                        
	}
	
	// Parse coordinates from CycleStreets API, return array of latlngs. 
	function parseCoordinates(coord_list) {
	   var routeCoordinates = [];
	   var coords = coord_list.split(' ');
	   $.each(coords, function(index, value) { 
	     var j = value.split(',');
	     var coord_lat = parseFloat(j[1]);
	     var coord_lng = parseFloat(j[0]);
	     var mylatlng = new google.maps.LatLng(coord_lat, coord_lng);
	     routeCoordinates.push(mylatlng);
	   });
	   return routeCoordinates;
	}
	// Get map bounds from array of latlngs. 
	function findBounds(latlng_array) {
	   var nbound = latlng_array[0].lat(),sbound = latlng_array[0].lat();
	   var ebound = latlng_array[0].lng(),wbound = latlng_array[0].lng();
	   $.each(latlng_array, function(index, value) { 
	       if (value.lat()>nbound) {
	           nbound = value.lat();
	       } else if (value.lat()<sbound) {
	           sbound = value.lat();
	       }
	       if (value.lng()<ebound) {
	           ebound = value.lng();
	       } else if (value.lng()>wbound) {
	           wbound = value.lng();
	       }
	   });
	   var map_bounds = new google.maps.LatLngBounds(new google.maps.LatLng(nbound, ebound), new google.maps.LatLng(sbound, wbound));
	   return map_bounds;
	}
	// Create long-click event, used on route page. 
	// function LongClick(map, length) {
	//     this.length_ = length;
	//     var me = this;
	//     me.map_ = map;
	//     google.maps.event.addListener(map, 'mousedown', function(e) { me.onMouseDown_(e) });
	//     google.maps.event.addListener(map, 'mouseup', function(e) { me.onMouseUp_(e) });   
	//     }   
	//     LongClick.prototype.onMouseUp_ = function(e) {
	// 	var now = +new Date;
	// 	var new_bounds = map.getBounds();
	// 	if ((now - this.down_ > this.length_)&&(new_bounds==this.original_bounds)) {
	// 	    google.maps.event.trigger(this.map_, 'longpress', e);
	// 	}   
	// }   
	// LongClick.prototype.onMouseDown_ = function(e) {
	//     this.down_ = +new Date;   
	//     this.original_bounds = map.getBounds();
	//     }
    // Check distance between two markers, used on route page. 
    google.maps.LatLng.prototype.distanceFrom = function(latlng) {
      var lat = [this.lat(), latlng.lat()]
      var lng = [this.lng(), latlng.lng()]
      var R = 6378137;
      var dLat = (lat[1]-lat[0]) * Math.PI / 180;
      var dLng = (lng[1]-lng[0]) * Math.PI / 180;
      var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat[0] * Math.PI / 180 ) * Math.cos(lat[1] * Math.PI / 180 ) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
      var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      var d = R * c;
      return Math.round(d);
    }
    // Create marker of appropriate type, used on route page. 
    function createMapMarker(location, marker_type) {
        // var image;
        // var heading;
        // if (marker_type==='start') { 
        //   image = new google.maps.MarkerImage('images/CSIcon_start_wisp.png',
        //      new google.maps.Size(50, 55),
        //      new google.maps.Point(0,0),
        //      new google.maps.Point(13,52));
        //      heading = 'Click to add start';
        //      start_marker = new google.maps.Marker({
        //         position: location, 
        //         map: map,
        //         draggable: true,
        //         clickable: true,
        //         icon: image
        //      });         
        // } else if (marker_type==='finish') {
        //   image = new google.maps.MarkerImage('images/CSIcon_finish_wisp.png',
        //          new google.maps.Size(50, 55),
        //          new google.maps.Point(0,0),
        //          new google.maps.Point(13,52));     
        //   heading = 'Click to add start';   
        //   finish_marker = new google.maps.Marker({
        //         position: location, 
        //         map: map,
        //         draggable: true,
        //         clickable: true,
        //         icon: image
        //      });  
        // }
    }
	// Add markers to photomap. 
	function addMarkers(map) { 
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
		// Remove existing markers. 
		for (i in photo_markers) {
	      photo_markers[i].setMap(null);
	    }
		$.ajax({
		   url: pm_url,
		   crossDomain: true, 
		   dataType: 'jsonp',
		   data: pmdata,
		   success: function(data) {
			   console.log(data);
		       if (data.marker!=undefined) {
			       // We have some results. 
			       function addNewMarker(v) { 
				       var marker = v['@attributes'];
		               if ($(marker).length > 0) {
		                   var marker_latlng = new google.maps.LatLng(marker.latitude, marker.longitude);
		                   //console.log(marker_latlng);
		                   // TODO: could use feature code to indicate whether good or bad.
		                   var feature = marker.feature;
		                   var map_marker = new google.maps.Marker({
		                     position: marker_latlng,
		                     title: marker.caption,
		                     icon: 'images/photomap.png'
		                   });
		                   map_marker.setMap(map);                           
		                   google.maps.event.addListener(map_marker, 'click', function() {
		                       window.location = '/photo.html?p=' + marker.id;
		                   });
                           photo_markers.push(map_marker);
		               }
                   }   
                   // We may have one marker as a dict, or many as an array.
		           if (data.marker.length!=undefined) {
			           $.each(data.marker, function(i,v) {
                           addNewMarker(v);
			           });			 
		           } else {
			           addNewMarker(data.marker);
		           }
			       $.mobile.hidePageLoadingMsg();
			   } else {
		          // Empty results. 
		          // TODO: this also gets called on a false result. 
		          // Check with CycleStreets webmasters what's going on. 
	              $.mobile.hidePageLoadingMsg();
	              toastMessage("No photos found in this area - try zooming out");			
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
    // Route journey using CycleStreets API. 
    function routeWithCycleStreets(start_lat, start_lng, finish_lat, finish_lng, route_id, strategy) {
        $.mobile.pageLoading(); 
        $('#marker-instructions').hide();
        $('#marker-remove').hide();
        var journey_url = CS_API + 'journey.json';
        var journeydata = {};
        journeydata['key'] = CS_API_KEY;
        speed = getItem("cyclingspeed");
        if (speed==null) {
          speed = DEFAULT_SPEED;
        }
        if (route_id!=null) {
            // Look up by route. 
            journeydata['itinerary']=route_id;
            journeydata['plan']=strategy;
        } else {
            journeydata['start_latitude'] = start_lat;
            journeydata['start_longitude'] = start_lng;
            journeydata['finish_latitude'] = finish_lat;                    
            journeydata['finish_longitude'] = finish_lng;
            if (strategy===null) {
                if (getItem("routetype")!=null) {
                   strategy = getItem("routetype");
                } else {
                   strategy = DEFAULT_ROUTE_TYPE;
                }   
            }  
            journeydata['plan'] = strategy;
            // Convert speed to kph, for the purposes of routing. 
            var speed_kph = kmToMph(null,speed);
            speed_kph = "20"// TODO: FIX $(speed_kph).attr("kph");
            journeydata['speed'] = speed_kph;
        }
        $.ajax({
            url: journey_url,
            data: journeydata,
            dataType: 'jsonp',
            jsonpCallback: 'journey',
            success: function(data) {
                if (($(data).length > 0) ){ //&& (data.marker != undefined
                    route_data = data;
                    var markers = route_data.marker;
                    if (markers!=undefined) {
                    // Get route information. 
                    var coordinates = markers[0]['@attributes'].coordinates;
                    var route_from = markers[0]['@attributes'].start;
                    var route_to = markers[0]['@attributes'].finish;
                    var start_lat = markers[0]['@attributes'].start_latitude;
                    var start_lng = markers[0]['@attributes'].start_longitude;
                    var finish_lat = markers[0]['@attributes'].finish_latitude;
                    var finish_lng = markers[0]['@attributes'].finish_longitude;
                    var startlatlng = new google.maps.LatLng(start_lat, start_lng);
                    var finishlatlng = new google.maps.LatLng(finish_lat, finish_lng);
                    // Set up map, if we haven't already, and markers.
                    if (map===undefined) {
                        setupMap(startlatlng, 'route');
                    }
                    // if (start_point==null) {
                    //     start_marker.setDraggable(false);
                    // } else {
                    //     createMapMarker(startlatlng, 'start'); 
                    // }
                    // if (finish_point==null) {
                    //     finish_marker.setDraggable(false);
                    // } else {
                    //     createMapMarker(finishlatlng, 'finish'); 
                    // }
                    // google.maps.event.clearListeners(map, 'click');
                    // google.maps.event.clearListeners(map, 'dblclick');
                    // $(map).unbind('click');
                    // $(map).unbind('dblclick');
                    // Show route summary information. 
                    var route_distance = markers[0]['@attributes'].length;
                    var route_time = markers[0]['@attributes'].time;
                    $('#route-header').text('Route ' + route_id);
                    //$('#route-from').text(route_from);
                    //$('#route-to').text(route_to);
                    var rs = toTitleCase(strategy) + ': ';
                    rs += metresToMiles(route_distance) + ' miles, ';
                	rs += secondsToMinutes(route_time) + ' min'//' at ';
                	//rs += speed + ' mph';
                	$('#summary').html(rs);
                    $('#prev-segment').hide();
                    document.title = 'CycleStreets \u00bb ' + toTitleCase(journeydata['plan']) + ' route from ' + route_from + ' to ' + route_to;
                    // Save route in local storage.
                    var route_id = markers[0]['@attributes'].itinerary;
                    var ls_name = 'route-' + route_id;
                    var ls_values = {};
                    ls_values['from'] = route_from;
                    ls_values['to'] = route_to;
                    ls_values['time'] = secondsToMinutes(route_time);
                    ls_values['distance'] = metresToMiles(route_distance);
                    ls_values['strategy'] = journeydata['plan'];
                    ls_values['speed'] = speed;
                    setItem(ls_name,ls_values);
                    // update hash
                    window.location.hash = 'r=' + route_id + '&p=' + journeydata['plan'];
                    // Add polyline and set map bounds. 
                    var coords = parseCoordinates(coordinates);
                    // Draw route on map.
                    if (routePath!=null) {
                       routePath.setMap(null);
                    }
                    if (individualPath!=null) {
                       individualPath.setMap(null);
                    }
                    routePath = new google.maps.Polyline({
                      path: coords,
                      strokeColor: "#CC33FF",
                      strokeWeight: 3
                    });     
                    routePath.setMap(map);
                    map.fitBounds(findBounds(coords)); 
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
	                    if (individualPath!=null) {
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
						// var listener = google.maps.event.addListener(map, "idle", function() { 
						//   if (map.getZoom()>18) map.setZoom(18); 
						//   google.maps.event.removeListener(listener); 
						// });
                    }
                    $('#next-segment').click(function() {
				        num++;
	                    updateSegment(num);
                    });
                    $('#prev-segment').click(function() {
		                num--;
	                    updateSegment(num)
                    });
                    // Resize map to take account of directions element. 
					var window_height = $(window).height() - $("div:jqmData(role='header')").first().height();
					if ($('#instructions-footer').is(":visible")) {
						console.log('footer is visible');
						window_height = window_height - $("div:jqmData(role='footer')").first().height();
					} else {
						console.log('footer is not visible');
					}
					$("div:jqmData(role='content')").first().height(window_height);
                    //google.maps.event.clearListeners(map, 'click');
                    $("#route-form").hide();
                    $('#navbar-options').hide();
                    $('#navbar-strategy').show();       
                    $('a#' + strategy).addClass('ui-btn-active');
                    // Bind each strategy type to lookup.
                    if ($('a#fastest').data("events")===undefined){
                        $("a#fastest").click(function() {  routeWithCycleStreets(null,null,null,null,route_id,'fastest');} );  
                    }
                    if ($('a#balanced').data("events")===undefined){
                        $("a#balanced").click(function() { routeWithCycleStreets(null,null,null,null,route_id,'balanced');} );
                    }
                    if ($('a#quietest').data("events")===undefined){
                        $("a#quietest").click(function() { routeWithCycleStreets(null,null,null,null,route_id,'quietest');} );
                   }
                    $.mobile.pageLoading(true); 
                } else {
                    toastMessage("Sorry, unable to find route!");
                    $('#routebutton').attr('value', 'Submit');
                    $.mobile.pageLoading(true);
                    return false;                   
                }
                } else {
                    toastMessage("Sorry, unable to find route!");
                    $('#routebutton').attr('value', 'Submit');
                    $.mobile.pageLoading(true);
                    return false;                    
                }
            },
            error: function(data) {
                toastMessage("Sorry, there's a problem with the routing server.");
                $('#routebutton').attr('value', 'Submit');
                $.mobile.pageLoading(true);
                finish_marker.setClickable(true);
                return false;
            }
        });
    }
    function geocodeWithCycleStreets(place_from,place_to) {
        var geocode_url = CS_API + 'geocoder.json';
        var geodata = {};
        geodata['key'] = CS_API_KEY;
        var bounds = map.getBounds();
        geodata['n'] = bounds.getNorthEast().lat();
        geodata['e'] = bounds.getNorthEast().lng();
        geodata['s'] = bounds.getSouthWest().lat();
        geodata['w'] = bounds.getSouthWest().lng();
        var start_lat,start_lng,finish_lat,finish_lng; 
        geodata['street'] = place_from;
        $.ajax({
            url: geocode_url,
            data: geodata,
            dataType: 'jsonp',
            jsonpCallback: 'places',
            success: function(from_data) {
                if (from_data.results.result!=undefined){
                   var from_result = from_data.results.result;
                   if (from_result.length===undefined) {
                       start_lat = from_result.latitude;
                       start_lng = from_result.longitude;   
                   } else {
                       start_lat = from_result[0].latitude;
                       start_lng = from_result[0].longitude;   
                   }  
                   geodata['street'] = place_to;
                   $.ajax({
                     url: geocode_url,
                     data: geodata,
                     dataType: 'jsonp',
                     jsonpCallback: 'places',
                     success: function(to_data) {
                         if (to_data.results.result!=undefined){
                             var to_result = to_data.results.result;
                             if (to_result.length===undefined) {
                                 finish_lat = to_result.latitude;
                                 finish_lng = to_result.longitude;   
                             } else {
                                 finish_lat = to_result[0].latitude;
                                 finish_lng = to_result[0].longitude;   
                             }
                             showMap(); 
                             routeWithCycleStreets(start_lat,start_lng,finish_lat,finish_lng,null,null);
                         } else {
                             toastMessage("Sorry, unable to geocode " + place_to);
                             $('#routebutton').attr('value', 'Submit');
                             $.mobile.pageLoading(true); 
                             return false;                    
                         }
                     },
                     error: function(data) {
                         toastMessage("Sorry, there's a problem with the geocoding server.");
                         $('#routebutton').attr('value', 'Submit');
                         $.mobile.pageLoading(true);
                         return false;
                     }
                 });                 
                } else {
                    toastMessage("Sorry, unable to geocode " + place_from);
                    $('#routebutton').attr('value', 'Submit');
                    $.mobile.pageLoading(true); 
                    return false;                    
                }
            },
            error: function(data) {
                toastMessage("Sorry, there's a problem with the geocoding server.");
                $('#routebutton').attr('value', 'Submit');
                $.mobile.pageLoading(true);
                return false;
            }
        });           
    }
    // Set up the map, its default type and event listeners. 
    // Used by both route and photomap pages. 
    function setupMap(loc, page_type) {
        console.log('setupMap');
	    console.log(loc);
        var myOptions = {
            zoom: 14,
            center: loc,
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            panControl: false,
            zoomControl: true,
            zoomControlOptions: {
                position: google.maps.ControlPosition.LEFT_TOP
            },
            mapTypeControlOptions: {
              mapTypeIds: ['OSM', 'OCM', 'OS'],
              style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
              position: google.maps.ControlPosition.RIGHT_TOP }
        };
        map = new google.maps.Map(document.getElementById("map-canvas"),myOptions);
        map.mapTypes.set('OSM',osmMapType);
        map.mapTypes.set('OCM',ocmMapType);
        map.mapTypes.set('OS',osMapType);
        // Set appropriate maptype. 
        if (getItem("maptype")=="OCM") {
            map.setMapTypeId('OCM');
        } else if (getItem("maptype")=="OS")  {
            map.setMapTypeId('OS');
        } else {
            map.setMapTypeId('OSM');
        }    
        google.maps.event.addListener(map, 'maptypeid_changed', function() { 
            setItem("maptype", this.getMapTypeId());
         });
        //console.log('map getting bounds');
        //console.log(map.getBounds());
        // Geolocate button: toggle geotracking. 
		$("#loc-label").click(function(){
			if ($('#loc').is(':checked')) {
                 stopTracking();
			} else {
				trackPosition();	  
				if (current_latlng!=null) {
					map.panTo(current_latlng);
				}
		    }
		});
		// If we are on the photomap page, add markers. 
		if (page_type==="photomap") {		
			google.maps.event.addListener(map, 'tilesloaded', function() {
			  addMarkers(map);
			});
	    }
		if (page_type==="route") {
	     //new LongClick(map, 300);
	    // Add reticle image to centre of map. 
	     var reticleImage = new google.maps.MarkerImage(
	        'images/reticle.png',            // marker image
	     new google.maps.Size(47, 47),    // marker size
	     new google.maps.Point(0,0),      // marker origin
	     new google.maps.Point(24, 24));  // marker anchor point, set to half height/width
	     var reticleShape = {
	       coords: [24,24,24,24],           // 1px, to avoid 'dead spot' on map
	       type: 'rect'                     // rectangle
	     };
	    var mapCenter = map.getCenter();
		reticleMarker = new google.maps.Marker({
		    position: mapCenter,
		    map: map,
		    icon: reticleImage, 
		    shape: reticleShape,
		    optimized: false,
		    zIndex: 5
		  });
	    google.maps.event.addListener(map, 'bounds_changed',
		      function(){reticleMarker.setPosition(map.getCenter());});
	    //google.maps.event.addListener(map, 'longpress', function(event) {     
		$('#marker-instructions').click(function() {
             if (finish_point!=null) {
                 // Check the two markers aren't too close together. 
                 //var point1 = start_marker.getPosition()
                 //var point2 = finish_marker.getPosition();
                 var dist = finish_point.distanceFrom(start_point);
                 if (dist < 200) {
                     toastMessage('Sorry, those points are too close together!')
                     return false;
                 } else {
                     routeWithCycleStreets(start_point.lat(),start_point.lng(),finish_point.lat(),finish_point.lng(),null,null);
                 }
             } else if (finish_point!=null) {
                 //createMapMarker(event.latLng, 'finish'); 
                 // Update instructions marker. 
                 $('#marker-instructions .ui-btn-text').text(GET_ROUTE);
                 $('#marker-instructions').unbind('click');
                 $('#marker-instructions').click(function() {
                      routeWithCycleStreets(start_marker.getPosition().lat(), start_marker.getPosition().lng(), finish_marker.getPosition().lat(), finish_marker.getPosition().lng(),null,null);  
                 });
                  // Set up remove finish marker button.
                  // Update remove marker. 
                  $('#marker-remove').css({
                      'color' : 'red',
                  });
                  $('#marker-remove').unbind('click');
                  $('#marker-remove').click(function() { 
                      if (finish_point!=null) {
                          finish_point = null;
                      }
                      $('#marker-instructions .ui-btn-text').text(SET_SECOND_MARKER);
                      $('#marker-remove').css({
                          'color' : 'green'
                      });     
                      $('#marker-remove').unbind('click');
                      $('#marker-remove').click(function() { 
                            if (start_marker!=null) {
                                start_marker.setMap(null);
                                start_marker = null;
                            }
                            $('#marker-instructions .ui-btn-text').text(SET_FIRST_MARKER);
                             $(this).hide();
                      });
                  });
                  $('#marker-remove').show();                
             } else {
                 // Add first marker. 
                //createMapMarker(event.latLng, 'start'); 
                 // Record the latlng of the map center.
                 start_point = map.getCenter();
                 console.log('Recording start_point');
                 console.log(start_point);
                 confirmBeforeLeaving(); // We should now confirm before leaving. 
                 $('#marker-instructions .ui-btn-text').text(SET_SECOND_MARKER);
                 $('#marker-instructions').show(); 
                 $('#marker-remove').unbind('click');
                 $('#marker-remove').click(function() { 
                     if (start_point!=null) {
                         start_point = null;
                     }
                     $('#marker-instructions .ui-btn-text').text(SET_FIRST_MARKER);
                     $(this).hide();
                 });
                 $('#marker-remove').show();
             } 
        });
        $("a#route-by-address").click(function(event){
            event.preventDefault();
            showAddressForm();
        });
        $.mobile.pageLoading(true); 
    }	 
        trackPosition();	 
        return true;
    }

}
