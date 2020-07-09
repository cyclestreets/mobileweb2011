// Minimal javascript for showing page of the form: https://m.cyclestreets.net/location/#10000

// CycleStreets API details. 
var CS_API_KEY = '68f786d958d1dbfb';
var CS_API_V2 = 'https://api.cyclestreets.net/v2/';

// These two functions are copies of the same named ones in cyclestreets.js

function getIndividualPhotoError (jqXHR, textStatus, errorThrown) {
    $('#photo-header').text('Sorry...');
    $('#photo-caption').html("Sorry, could not retrieve data for photo.");
    $('#loading-icon').hide();
    $('#getting-photo').hide();
}

function getIndividualPhoto(photo_id, caption) {
    //console.log('getIndividualPhoto');

    // Maplets have this form:
    // https://www.cyclestreets.net/location/34751/photomaplet34751zoom16.png
    // #!# This should be changed using the new photomapletLocation parameter in the V2 API when that supports multiple zoom levels
    var mapletUrl = 'https://www.cyclestreets.net/location/' + photo_id + '/photomaplet'+ photo_id + 'zoom';

    var photo_title = 'Photo from CycleStreets';
    var photo_url = CS_API_V2 + 'photomap.location';
    var photodata = {};
    photodata['key'] = CS_API_KEY;
    photodata['id'] = photo_id
    photodata['fields'] = 'id,imageUrl,caption,username,datetime,thumbnailSizes,shortlink,url';
    photodata['datetime'] = 'friendly';
    photodata['format'] = 'flat';
    // Get photo information - latlng etc.
    $.ajax({
        url: photo_url,
        data: photodata,
        dataType: 'jsonp',
        jsonpCallback: 'photo',
        success: function(data) {
            if (data.error!==undefined) {
		getIndividualPhotoError();
		return;
            }
            // Get URL, date etc. 
            $('#getting-photo').hide();  
            var image_url = data.imageUrl;
            if (typeof(data.caption)==='string') {
                caption += data.caption;
            }
            // Get the best size to display the photo. 
            var live_sizes = data.thumbnailSizes;
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
            $('#photo-header').text('Photo ' + data.id);
            caption += '<br/><em>Uploaded by ' + data.username + " at " + data.datetime + "</em>.";
            $("a#twitter_link").attr("href", "https://twitter.com/intent/tweet?text=Great+photo+on+%40CycleStreets%21+" + encodeURIComponent(data.shortlink));
            $("a#facebook_link").attr("href", "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(data.shortlink));
            $("a#permalink").attr("href", data.url);
            $('#social_links').show();
            $('#photo-caption').html(caption);

	    // Link through to the largest available thumbnail
            $('#photo-biglink').attr('href', data.imageUrl);

	    // Street, district and distant maplets
            $('#photomaplet16').attr({src: mapletUrl + '16size256x256.png'});
            $('#photomaplet13').attr({src: mapletUrl + '13size256x256.png'});
            $('#photomaplet10').attr({src: mapletUrl + '10size256x256.png'});
	},
        error: getIndividualPhotoError
    });
}
