<?php

// Load the config
require_once ('./.config.php');

$message = '';

// Check whether we need to register the user first. 
if (($_POST["login"])=='register') {
    $registration_fields = array(
        'username'=>urlencode($_POST["username"]),
        'password'=>urlencode($_POST["password"]),
        'name'=>urlencode($_POST["name"]),
        'email'=>($_POST["email"])
    );
    $fields_string = http_build_query($registration_fields);
    $url = 'https://www.cyclestreets.net/api/usercreate.json?key=' . $config['registeredapikey'];
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL,$url);
    curl_setopt($ch,CURLOPT_POST,count($fields));
    curl_setopt($ch,CURLOPT_POSTFIELDS,$fields_string);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    $response = curl_exec ($ch); 
    $obj = json_decode($response);
    $message = $obj->{'result'}->{'message'};
    if (isset($obj->{'result'}->{'code'})) {
        if ($obj->{'result'}->{'code'}=="0") {
            $photo_url = '/location/#-1/' . rawurlencode($message);        
            header("Location: $photo_url");
        } 
    } else {
        $photo_url = '/location/#-1/' . rawurlencode('Problem creating new user');     
        header("Location: $photo_url");
    }
    curl_close ($ch);
}

if ($_FILES["file"]["error"] > 0) {
    $message = "File error: " . $_FILES["mediaupload"]["error"];
    $photo_url = '/location/#-1/' . rawurlencode($message);        
    header("Location: $photo_url");
} else {
    $file = $_FILES['mediaupload'];
    $file_field="@$file[tmp_name]";
    $fields = array(
        'mediaupload'=>$file_field,
        'username'=>urlencode($_POST["username"]),
        'password'=>urlencode($_POST["password"]),
        'latitude'=>urlencode($_POST["latitude"]),
        'longitude'=>urlencode($_POST["longitude"]),
        'datetime'=>urlencode($_POST["datetime"]),
        'category'=>urlencode($_POST["category"]),
        'metacategory'=>urlencode($_POST["metacategory"]),
        'caption'=>($_POST["description"])
    );
    $fields_string = http_build_query($fields);
    $url = 'https://www.cyclestreets.net/api/addphoto.json?key=' . $config['registeredapikey'];
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL,$url);
    curl_setopt($ch,CURLOPT_POST,count($fields));
    curl_setopt($ch,CURLOPT_POSTFIELDS,$fields);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    $response = curl_exec($ch);
    curl_close($ch);
    $string='{"name":"John Adams"}';
    $obj = json_decode($response);
    if (isset($obj->{'error'}->{'message'})) {
        $message = $obj->{'error'}->{'message'};
        $photo_url = '/location/#-1/' . rawurlencode($message);        
        header("Location: $photo_url");
    } else {
        $photo_url = $obj->{'result'}->{'url'};
        $photo_url = str_replace("\\","",$photo_url);
        $photo_url = explode("/",$photo_url);
        $num = (count($photo_url) - 2);
        $photo_id = $photo_url[$num];
        $photo_url = '/location/#' . rawurlencode($photo_id) . '/' . rawurlencode('Photo successfully uploaded');
        header("Location: $photo_url");
    }
}

?>