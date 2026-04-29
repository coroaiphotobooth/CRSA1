// temporary script to debug
const url = 'https://script.google.com/macros/s/AKfycbydPxUH77EAIf79llD0-jPQJQHssx72km8P4CVUDX1Nvz96US4yg8i1WUWdeVwyFMsW/exec?action=verify&kode=69GG';

fetch(url)
  .then(res => res.text())
  .then(text => console.log("APPS_SCRIPT_RESPONSE:", text))
  .catch(err => console.error("FETCH ERROR:", err));
