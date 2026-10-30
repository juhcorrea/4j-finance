/* The login and signup share one password field; visibility never persists. */
(function(){
  const input=document.getElementById('auth-password');
  const button=document.getElementById('auth-password-toggle');
  const form=document.getElementById('auth-form');
  if(!input||!button||!form)return;
  function show(visible){
    const start=input.selectionStart,end=input.selectionEnd;
    input.type=visible?'text':'password';
    const label=visible?'Ocultar senha':'Mostrar senha';
    button.setAttribute('aria-label',label);button.title=label;
    button.querySelector('.password-eye-open').hidden=visible;
    button.querySelector('.password-eye-closed').hidden=!visible;
    try{if(start!==null&&end!==null)input.setSelectionRange(start,end);}catch{}
  }
  button.addEventListener('pointerdown',event=>{
    if(document.activeElement===input)event.preventDefault();
  });
  button.addEventListener('click',()=>show(input.type==='password'));
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-auth]'))show(false);
  });
  form.addEventListener('submit',()=>show(false),true);
  window.addEventListener('pageshow',()=>show(false));
  show(false);button.hidden=false;
})();
