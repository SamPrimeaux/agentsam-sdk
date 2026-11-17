/** Pure scope validation for third-party OAuth providers without userinfo endpoints. */
export function validateStateBoundOAuthScopes(payload,requested){
  const fail=(code)=>{const error=new Error(code);error.code=code;throw error;};
  if(!Array.isArray(requested)||requested.length===0||requested.some(scope=>typeof scope!=='string'||!scope))
    fail('plugin_oauth_scope_request_invalid');
  const granted=typeof payload?.scope==='string'&&payload.scope.trim()
    ? [...new Set(payload.scope.trim().split(/\s+/))] : requested;
  if(!requested.every(scope=>granted.includes(scope))||granted.some(scope=>!requested.includes(scope)))
    fail('plugin_oauth_scope_mismatch');
  return granted;
}
