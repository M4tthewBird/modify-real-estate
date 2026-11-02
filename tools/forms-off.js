// Development copy only: Webflow forms would still post to the client's real Webflow account.
document.addEventListener('submit', (event) => {
    if (event.target.id === 'wf-form-filter') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    alert('Formuláře v testovací kopii zatím nic neodesílají.');
}, true);
