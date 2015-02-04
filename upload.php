<?php

// Load the config
require_once ('./.config.php');

$message = '';

// Check whether we need to register the user first.
if (($_POST["login"])=='register') {
    $registration_fields = array(
        'username'=>urlencode($_POST["username"]),
        'password'=>urlencode($_POST["password"]),
        'email'=>$_POST["email"],
        'name'=>urlencode($_POST["name"]),
    );
    $fields_string = http_build_query($registration_fields);
    $url = 'https://api.cyclestreets.net/v2/user.create?key=' . $config['registeredapikey'];
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL,$url);
    curl_setopt($ch,CURLOPT_POST,count($fields));
    curl_setopt($ch,CURLOPT_POSTFIELDS,$fields_string);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    $response = curl_exec ($ch);
    curl_close ($ch);
    
    // Process the result, and show any error
    $result = json_decode ($response, true);
    if (!$result) {
        $photo_url = '/location/#-1/' . rawurlencode('Problem creating new user account - please try again later.');
        header("Location: $photo_url");
        return;
    }
    if (isSet ($result['error'])) {
        $photo_url = '/location/#-1/' . rawurlencode($result['error']);
        header("Location: $photo_url");
        return;
    } else {
        $message = $result['successmessage'];
        // Carry on below
    }
}

if ($_FILES["mediaupload"]["error"] > 0) {
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
        'category'=>urlencode($_POST["category"]),
        'metacategory'=>urlencode($_POST["metacategory"]),
        'caption'=>($_POST["description"])
    );
    $fields_string = http_build_query($fields);
    $url = 'https://api.cyclestreets.net/v2/photomap.add?key=' . $config['registeredapikey'];
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL,$url);
    curl_setopt($ch,CURLOPT_POST,count($fields));
    curl_setopt($ch,CURLOPT_POSTFIELDS,$fields);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    $response = curl_exec($ch);
    curl_close($ch);
    $result = json_decode($response, true);
    if (isset($result['error'])) {
        $message = $result['error'];
        $photo_url = '/location/#-1/' . rawurlencode('The image could not be uploaded because: ' . $message);
    } else {
        $photo_id = $result['id'];
        $photo_url = '/location/#' . rawurlencode($photo_id) . '/' . rawurlencode('Thank you - the photo has been successfully uploaded:');
    }
    header("Location: $photo_url");
}

?>
