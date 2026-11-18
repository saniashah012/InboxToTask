-- Adds "reimbursement" and "reimbursements" to the Financial starter word list, so
-- reimbursement notices are skipped before any model call when Financial is a skipped
-- topic. Same function as 20261109200000 apart from those two words.
--
-- Only a later selection of Financial (or a conversion of a list saved without words)
-- picks up the new words: a list already saved in scan_settings keeps its own words.
--
-- Must match STARTER_BLOCKED_WORDS in pipeline/private-topics.mjs and
-- starterBlockedWords in web/src/filterPresets.ts (tests compare them).
create or replace function private.starter_blocked_words(topic text) returns jsonb
language sql immutable set search_path='' as $$
 select case topic
  when 'financial' then '["bank statement","bank statements","account number","routing number","credit card","debit card","credit score","credit report","loan","loans","mortgage","tax return","tax returns","w-2","1099","paycheck","pay stub","pay stubs","payroll","wire transfer","overdraft","balance due","billing statement","financial aid","venmo","zelle","paypal","reimbursement","reimbursements"]'::jsonb
  when 'health' then '["diagnosis","diagnoses","diagnosed","prescription","prescriptions","pharmacy","medication","medications","therapist","therapy","counseling","mental health","medical","medical record","medical records","lab results","patient portal","mychart","symptoms","health insurance","insurance claim","clinic","hospital","doctor","doctors","vaccine","vaccination","surgery"]'::jsonb
  when 'promotions' then '["promo code","promo codes","coupon","coupons","discount code","free shipping","limited time offer","flash sale","shop now","order now","special offer","exclusive offer","deal ends"]'::jsonb
  when 'family & friends' then '["mom","dad","mother","father","grandma","grandpa","grandmother","grandfather","aunt","uncle","cousin","sister","brother","family","birthday party","love you","miss you"]'::jsonb
  else jsonb_build_array(topic) end
$$;
revoke all on function private.starter_blocked_words(text) from public,anon,authenticated;
