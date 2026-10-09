
# THEORY_LENS — InboxToTask

## 1. Working Theory Claim

Our hybrid should outperform both human-only and AI-only approaches in email and task management because humans verify critical information and make final decisions, while AI handles information processing and task extraction. To achieve complementarity between humans and artificial intelligence, AI needs to provide reliable and verifiable information, and users must be able to review and correct its outputs. By combining AI's efficiency with human judgment, our system aims to reduce missed tasks, information errors, and the impact of AI hallucinations.

## 2. Cognitive Diagnosis

| Cognitive Dimension | AI Responsibilities | Human Responsibilities |
|---|---|---|
| Reasoning | Extract and organize information and provide recommendations. | Evaluate task accuracy, consider the context, and make final decisions. |
| Memory | Store and organize extracted task information for future retrieval. | Verify whether the information is complete and accurate. |
| Attention | Identify important tasks from emails and analyze their deadlines. | Review the results and check for overlooked tasks. |

### Meta-coordination

In our InboxToTask system, the AI is primarily responsible for extracting and organizing task information from emails and making recommendations to users, while users always retain the final say. For example, when the AI identifies a task in an email, the user can choose to accept, modify, or delete that task.

If the AI is unable to accurately determine the task requirements in an email, or if it detects conflicts in information such as deadlines, the system should proactively prompt the user to review the details rather than making a decision on its own. Furthermore, when there is a discrepancy between the user's judgment and the AI's, the user's final decision should prevail.

In this way, we aim to leverage AI to improve task management efficiency while minimizing the impact of erroneous information and ensuring that users retain control over the entire task management process.

## 3. Evidence → Theory → Design

| Failure Receipt / Evidence | Theoretical Interpretation | Design Implication |
|---|---|---|
| **E01 and E06 (Claude):** Claude determined that the two emails might pertain to the same assignment, but their deadlines were different. Since it could not confirm whether they referred to the same task, Claude listed them separately and flagged the uncertainty. | This example illustrates that while AI can quickly extract task information from emails, it may still lack sufficient contextual information when determining the relationships between different emails. This relates to **Reasoning** in Gonzalez et al. (2026). Human judgment based on the actual context is still required. | When AI detects possible duplicate tasks or conflicting deadlines, InboxToTask should alert the user and display the original emails. Users can then verify or merge the tasks rather than relying entirely on AI's judgment. |
| **Copilot — E09:** Copilot classified E09 as Passive and listed no outstanding task, even though the email contained an explicit conditional reminder request. However, the reminder appeared later in its output, creating an inconsistency. | **Reasoning and Memory:** AI may recognize a conditional task but fail to classify it consistently. This could cause important responsibilities to be overlooked. | InboxToTask should check whether task classifications match the extracted actions and clearly display conditional tasks for users to review. |
| **ChatGPT — Task Count:** ChatGPT reported 12 outstanding tasks in its summary, but its detailed list appears to contain only 11, including E09. | **Memory and Reliability:** AI may correctly identify individual tasks while producing inconsistent summaries. This shows why users need accurate and verifiable task records. | InboxToTask should automatically calculate task totals from the extracted task list and flag any inconsistencies between the summary and the actual tasks. |


## 4. Design Principle and Checkpoint 3 Evaluation

We have chosen the **Partition Roles** approach as our primary design principle. In InboxToTask, the AI is responsible for extracting tasks from emails, organizing deadlines, and making recommendations, while the user is responsible for verifying the accuracy of this information and making the final decision. We believe this division of labor leverages the AI's efficiency in information processing while utilizing human judgment to reduce errors.

In Checkpoint 3, we plan to use the same set of emails to test three different task management approaches. The first involves humans reading the emails and organizing tasks entirely on their own; the second relies entirely on AI to automatically extract tasks; and the third involves the AI extracting tasks and then submitting them to the user for review. We will compare how accurately each approach identifies tasks, how many tasks it misses, how many mistakes it makes, and how long it takes.
