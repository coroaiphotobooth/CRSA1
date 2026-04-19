// temporary script to debug
const url = 'https://script.google.com/macros/s/AKfycbw5ZUzv-XwzgYJPvQt_PN42Yof3NivR_V3TJ3mfa6XkhsmAiOHMzZ5OTjA2NrKQk8s8/exec?action=verify&kode=69GG';

fetch(url)
  .then(res => res.text())
  .then(text => console.log("APPS_SCRIPT_RESPONSE:", text))
  .catch(err => console.error("FETCH ERROR:", err));
