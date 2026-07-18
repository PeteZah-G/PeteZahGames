'use strict';
/**
 * @type {HTMLFormElement}
 */
const form = document.getElementById('uv-form');
/**
 * @type {HTMLInputElement}
 */
const address = document.getElementById('uv-address');
/**
 * @type {HTMLInputElement}
 */
const searchEngine = document.getElementById('uv-search-engine');
/**
 * @type {HTMLParagraphElement}
 */
const error = document.getElementById('uv-error');
/**
 * @type {HTMLPreElement}
 */
const errorCode = document.getElementById('uv-error-code');

// Attach form submit event listener
form.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await registerSW();
  } catch (err) {
    error.textContent = 'Failed to register service worker.';
    errorCode.textContent = err.toString();
    throw err;
  }

  const url = search(address.value, searchEngine.value);
  location.href = __uv$config.prefix + __uv$config.encodeUrl(url);
});

// Autofill function with auto-submit
function autofill(url) {
  address.value = url;
  form.requestSubmit(); // Automatically submit the form
}
