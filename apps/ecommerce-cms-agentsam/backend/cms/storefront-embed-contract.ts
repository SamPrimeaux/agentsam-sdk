/**
 * Runtime-independent embed submission contract.
 * Site/D1 schemas may retain NULL names for imported and checkout contacts.
 * Required signup fields come from each component's configuration.
 */
export type SubscriberField = 'email' | 'first_name' | 'last_name' | 'phone' | 'message';
export type SubscriberStatus = 'pending' | 'subscribed' | 'unsubscribed' | 'bounced' | 'complained';
export interface SubscriptionComponentConfig {
  required_fields: SubscriberField[];
  fields: SubscriberField[];
  double_opt_in: boolean;
  source_type: 'form' | 'popup';
  source_ref: string;
}
export interface ValidatedSubscriberFields {
  email: string;
  first_name: string | null;
  last_name: string | null;
}
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const requiredNames: readonly SubscriberField[] = ['email', 'first_name'];
const blockedStatuses: ReadonlySet<SubscriberStatus> = new Set(['bounced','complained','unsubscribed']);

/** Never trust client-supplied required_fields in a live submission; load the component config server-side. */
export function signupRequirements(config: Pick<SubscriptionComponentConfig, 'required_fields'>): SubscriberField[] {
  const unique = new Set<SubscriberField>(requiredNames);
  for (const field of config.required_fields || []) {
    if (['email','first_name','last_name','phone','message'].includes(field)) unique.add(field);
  }
  return [...unique];
}
export function validateSignupFields(
  data: Record<string, unknown>,
  component: Pick<SubscriptionComponentConfig,'required_fields'>,
): {ok: true; fields: ValidatedSubscriberFields} | {ok: false; error: string} {
  const required = signupRequirements(component);
  const value = (field: SubscriberField): string =>
    typeof data[field] === 'string' ? (data[field] as string).trim() : '';
  for (const field of required) {
    if (!value(field)) return {ok:false,error:field + ' is required'};
  }
  const email = value('email').toLowerCase();
  if (!emailPattern.test(email)) return {ok:false,error:'Invalid email address'};
  return {ok:true,fields:{email,first_name:value('first_name') || null,last_name:value('last_name') || null}};
}
/** Upsert must never revive an explicitly unsubscribed, bounced or complained contact. */
export function allowsSubscriptionTransition(status: SubscriberStatus): boolean {
  return !blockedStatuses.has(status);
}
