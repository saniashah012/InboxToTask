# Individual Literature Review Reflection

## Paper 1: Domain Adaptation for Commitment Detection in Email

### 1. Full Citation & Link

Azarbonyad, H., Sim, R., & White, R. W. (2019). Domain adaptation for commitment detection in email. In *Proceedings of the Twelfth ACM International Conference on Web Search and Data Mining* (pp. 672–680). Association for Computing Machinery. [https://doi.org/10.1145/3289600.3290984](https://doi.org/10.1145/3289600.3290984)

### 2. Structured Summary

#### Research Problem

This paper investigates how machine learning can be used to automatically identify commitments in emails, such as when someone promises to complete or send something in the future. The researchers used two email datasets, Enron and Avocado, and labeled sentences based on whether they contained a commitment. They then trained and evaluated machine learning models to see how accurately commitments could be detected and whether a model trained on one email dataset would work well on another. The results showed that commitment detection worked reasonably well when models were trained and tested on similar email data, but performance decreased when they were applied to a different email domain. The researchers found that domain adaptation techniques could improve this cross-domain performance, showing both the potential of automated commitment detection and the importance of accounting for differences in how people communicate.

#### Methodology

The researchers used the Enron and Avocado email datasets and labeled sentences according to whether they contained a commitment. They trained and evaluated machine learning models on these datasets, including tests in which a model trained on one email domain was applied to another.

#### Main Findings

Commitment detection worked reasonably well when models were trained and tested on similar email data, but performance decreased across different email domains. Domain adaptation techniques improved cross-domain performance, demonstrating both the potential of automated commitment detection and the importance of accounting for differences in communication styles.

### 3. Three Key Insights

1. Commitments can be identified directly from email language. Commitments are often embedded within normal messages rather than explicitly written as tasks, but the study shows that these future actions can still be automatically detected.
2. Language and context can vary significantly across different email environments. A model that works well on one email dataset may not perform as well on another because people use different vocabulary, writing styles, and ways of expressing commitments.
3. Detecting commitments can be useful for more than simply classifying emails. Once a system recognizes that someone has promised to do something, that commitment could potentially be tracked or surfaced later so that it is not forgotten.

### 4. Two Limitations or Risks

1. The model did not generalize equally well across different types of email. Its performance decreased when it was trained on one email dataset and tested on another, which could be an issue for a system intended for people with very different communication styles and email environments.
2. The paper focuses specifically on commitments, which are only one form of actionable information that can appear in an email. Emails can also contain requests, deadlines, meetings, and other information that requires action, so a broader productivity tool would need to recognize and distinguish between these different categories.

### 5. One Concrete Inspiration

This paper inspired the idea of organizing actions based on who is responsible for completing them rather than treating every actionable email as a generic task. For example, “I’ll send you the revised slides by Thursday” could be recognized as something the user is waiting on, while “Can you send me the revised slides by Thursday?” could become one of the user’s own tasks. For InboxToTask, this could lead to categories such as “My Tasks” and “Waiting On,” with the system also extracting relevant deadlines or expected completion dates.

---

## Paper 2: Smart To-Do: Automatic Generation of To-Do Items from Emails

### 1. Full Citation & Link

Mukherjee, S., Mukherjee, S., Hasegawa, M., Hassan Awadallah, A., & White, R. (2020). Smart To-Do: Automatic generation of To-Do items from emails. In *Proceedings of the 58th Annual Meeting of the Association for Computational Linguistics* (pp. 8680–8689). Association for Computational Linguistics. [https://doi.org/10.18653/v1/2020.acl-main.767](https://doi.org/10.18653/v1/2020.acl-main.767)

### 2. Structured Summary

#### Research Problem

This paper explores how a system can automatically generate useful to-do items from emails where the sender has committed to performing an action. The researchers created a dataset using emails from the Avocado email corpus and developed a two-stage system that first identifies relevant context surrounding a commitment and then generates a short to-do item from that information. The system considers not only the commitment itself but also information from the surrounding email thread and metadata, such as the sender, recipient, and subject. The researchers tested several text-generation approaches and found that their sequence-to-sequence model with a copy mechanism performed best, allowing the system to preserve important details such as names and task-specific information from the original email. Overall, the study demonstrates that commitments contained within emails can be automatically transformed into concise to-do items, reducing some of the manual work involved in turning email information into tasks.

#### Methodology

The researchers created a dataset from the Avocado email corpus and developed a two-stage system. The first stage identifies relevant context around a commitment, while the second generates a concise to-do item using the email thread and metadata such as the sender, recipient, and subject. They evaluated several text-generation approaches, including a sequence-to-sequence model with a copy mechanism.

#### Main Findings

The sequence-to-sequence model with a copy mechanism performed best because it preserved important details such as names and task-specific information. Overall, the study showed that commitments in email can be transformed into concise to-do items, reducing the manual work required to turn email information into tasks.

### 3. Three Key Insights

1. **Detecting an action is only the first step; the information also needs to be transformed into something useful.** Identifying that an email contains a commitment does not necessarily help the user manage it. Smart To-Do shows how that information can be converted into a short, actionable task that is easier to track.
2. **The surrounding email context is important for understanding a task.** A commitment such as “I’ll send it tomorrow” may not make sense by itself because the object of the task could have been mentioned earlier in the conversation. The study found that previous emails in a thread often contained useful information for creating a complete to-do item, showing the importance of considering the conversation rather than analyzing individual sentences alone.
3. **Generated tasks need to preserve important details while remaining concise.** Information such as names, dates, and specific objects can be necessary for a task to actually be useful. The paper’s best-performing model used a copy mechanism that helped preserve this information from the original email when generating the to-do item.

### 4. Two Limitations or Risks

1. **The system focuses primarily on commitments made by the sender.** While this is useful for identifying promised actions, emails can contain many other types of actionable information, including requests directed at the user, deadlines, meetings, and follow-ups. A broader email productivity system would need to recognize these different types of actions and determine how each should be handled.
2. **Automatically generated tasks may lose or misinterpret important context.** The paper shows examples where generated tasks contain incorrect or incomplete details, meaning that an automatically created task may not always accurately represent what the user actually needs to do. This creates a risk if users rely on generated tasks without reviewing them, especially when the original email is ambiguous.

### 5. One Concrete Inspiration

This paper inspired the idea that InboxToTask should not simply identify that an email is actionable, but should turn the information into a short, structured next step while preserving the context needed to understand it. For example, instead of only flagging “I’ll send it tomorrow” as actionable, the system could look at the surrounding email thread to determine what “it” refers to, who is responsible, and when it is expected. InboxToTask could then organize the result as a task, something the user is waiting on, a deadline, or an event depending on the meaning of the email. To reduce the risk of incorrect interpretations, the user could also review or edit the generated action before saving it.

