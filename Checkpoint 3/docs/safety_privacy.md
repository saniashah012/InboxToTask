# Safety & Privacy

## 1. Potential Security and Privacy Risks

InboxToTask is an application that uses AI to analyze emails and generate task suggestions. Since emails may contain names, email addresses, class schedules, and other personal information, the system must address the following security and privacy risks:

1. **User data leaks:** If the system fails to properly verify user identities or if the database lacks access restrictions, users may view or modify other people's task information.
2. **Google authorization credential leakage:** The system requires Google authorization to connect to email accounts. If authorization credentials are not properly protected, this could lead to unauthorized account access.
3. **AI analysis errors and malicious instructions:** AI may misinterpret email content, generating inaccurate tasks or deadlines. Emails may also contain malicious instructions—known as *prompt injection*—that attempt to trick the AI into ignoring predefined rules.
4. **Service abuse and resource consumption:** Repeated AI analysis requests may exceed service limits, incur additional charges, or cause temporary system unavailability.

## 2. Protective Measures Already Implemented

The team has implemented several security measures in the backend code:

1. **User authentication:** The system authenticates users through Supabase Auth. The backend verifies the user's access token with the Supabase authentication service instead of trusting user-submitted identity information. This helps prevent unauthorized requests.

   **Related code:** `Checkpoint 3/app/supabase/functions/_shared/auth.mjs`

2. **Database access restrictions:** Supabase Row-Level Security (RLS) policies compare the authenticated user's identity with the task owner's user ID. The policies are designed to restrict read, create, update, and delete operations to a user's own task records.

   **Related code:** `Checkpoint 3/app/supabase/migrations/20261104050100_tasks_access.sql`

3. **Encryption of Google authorization credentials:** The backend uses AES-GCM to encrypt Google authorization credentials. Encryption and decryption take place on the backend, with credential handling associated with the user's identity to reduce the risk of improper access or use.

   **Related code:** `Checkpoint 3/app/supabase/functions/_shared/google-connection.mjs`

4. **Input validation and limitations:** The current email-analysis testing API accepts only predefined fictional email examples. It validates request format, example IDs, and request size, including a 1,024-byte request-body limit.

   **Related code:** `Checkpoint 3/app/supabase/functions/_shared/fixture-handler.mjs`

5. **AI request usage controls:** The backend includes AI request budgets, duplicate-processing controls, and retry limits. Processing status helps determine whether another AI call should proceed, reducing redundant analysis and unnecessary resource use.

   **Related code:** `Checkpoint 3/app/supabase/functions/_shared/storage.mjs`

These measures are represented in the project code, but some features still require validation in the deployed environment.

## 3. Failure Fallback Plan

The backend includes error-handling mechanisms to avoid continuing unreliable operations when problems occur:

1. **Authentication failure:** Invalid or missing credentials cause the request to be rejected with HTTP 401. If the authentication service is unavailable, the backend can return HTTP 503 rather than proceeding without verifying identity.
2. **Invalid input:** Malformed requests, oversized request bodies, or disallowed test examples are rejected with appropriate errors before AI analysis proceeds.
3. **AI service failure:** When AI service request limits are reached, the backend can return HTTP 429. If the AI service is unavailable or incorrectly configured, it can return HTTP 503 rather than reporting success.
4. **Duplicate requests and processing limits:** Stored processing states and budget controls help reduce duplicate AI calls and stop further processing when budget or attempt limits are reached.

**Related code:** `Checkpoint 3/app/supabase/functions/_shared/fixture-handler.mjs` and `Checkpoint 3/app/supabase/functions/_shared/storage.mjs`

The project also includes a user-review workflow for AI-generated task suggestions. However, the complete approval process still requires deployment-level testing; the code design alone does not establish that every unapproved operation is blocked.

## 4. Test Methods and Validation

The team has written automated tests for selected security mechanisms. The tests simulate normal requests, invalid input, and service failures to check whether operations are accepted or rejected as expected.

1. **Authentication tests:** Simulate unauthenticated users, invalid access tokens, and an unavailable authentication service. These tests are designed to verify that the backend rejects unauthorized requests.

   **Test file:** `Checkpoint 3/tests/supabase-endpoint.test.mjs`

2. **Database permissions tests:** Use different user identities to check whether users can access their own tasks while being prevented from accessing other users' records.

   **Test file:** `Checkpoint 3/app/supabase/tests/tasks_access.test.sql`

3. **Google credential protection tests:** Use fictional authorization credentials to test encryption, decryption, and Google connection handling. These tests do not establish that authorization with real Google accounts has been verified.

   **Test file:** `Checkpoint 3/tests/google-connection.test.mjs`

4. **Input constraints and error-handling tests:** Submit requests with missing authentication, malformed input, unsupported content types, or simulated AI service errors to check expected HTTP status codes and error messages.

   **Test file:** `Checkpoint 3/tests/supabase-endpoint.test.mjs`

5. **Prompt injection test preparation:** The project contains a fictional email fixture with malicious instructions for evaluating whether AI processing is influenced by untrusted email content. The fixture's existence does not, by itself, prove that prompt injection attacks are blocked.

   **Test fixture:** `Checkpoint 3/tests/fixtures/prompt-injection.json`

**Current limitations:** The reviewed code does not establish complete personally identifiable information (PII) sanitization or comprehensive malicious-content filtering. Processing real Gmail messages, production user-data isolation, and the full approval workflow also require further verification. Existing tests help assess expected behavior but do not guarantee that the deployed system is free of security risks.
