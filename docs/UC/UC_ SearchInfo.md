# Use Case: Search Information

Short Name: SearchInfo

Participating Actors  
The use case is initiated by a Member.

Brief Description  
The use case allows the Member to search for any information stored in the system.

Assumption  
The Member is logged into the system.

Flow of Events

Basic Flow

1. The use case starts when the Member elects to search for information stored in the system.
2. The app asks the Member to provide their search criteria (refer to Search Rules under **Search Criteria**) and provides a space to do so.
3. The Member provides his search criteria.
4. The app queries its stored information based on both the current **Search Context** (current screen) of the application and the provided **Search Criteria** according to the **Search Rules**.
5. The app displays any information matching the search context and the Member’s search criteria.

Alternative Flows \[all mandatory\]

- A1 NoMatches. In step 5, if there are no matches _(or no results need to be displayed)_, the system lets the Citizen know about the situation. The use case returns to step 3\.
- A2 CancelSearch. At any time, the Citizen can elect to stop searching. The use case ends.

Rules \[Make sure that the **Rules** are covered in the **OOA model**\]

- **R1 Search Rules**:
  - A search is **contextual**, as the system behavior varies depending on the context (current screen).

| Search Context | Search Criteria | Search Results |
| :-- | :-- | :-- |
| List of users (username) | Member provides one or more search words where each search work is an existing username (or part of a username) | App displays a list of all users whose username matches the search words provided. First matching users who are online are displayed, followed by matching users who are offline. Within each group, users are displayed in alphabetical order using their usernames and emails. |
| List of users (email) | Member provides one or more search words where each search work is an email address (or part of an email address) | App displays a list of all users whose email matches the search word provided. First matching users who are online are displayed, followed by matching users who are offline. Within each group, users are displayed in alphabetical order using their usernames and emails. |
| ~~List of announcements~~ | ~~Member provides one or more search words~~ | ~~App displays the 10 latest announcements including these words (together with sender username and timestamp). The Member can ask to see more announcements by sets of 10\. Announcements are displayed in reverse chronological order. **Note**: If the search criteria include only **stop words** (see **Stopword Rule** below), no results are displayed.~~ |
| Custom context 1 from one of the TUCs | Member provides one or more search words compatible with the context | App displays the 10 latest matching items for the resources associated with the custom context. The Member can ask to see more matches by sets of 10\. Decide whether the **Stopword Rule** below applies here. |
| Custom context 2 from one of the TUCs | Member provides one or more search words compatible with the context | App displays the 10 latest matching items for the resources associated with the custom context. The Member can ask to see more matches by sets of 10\. Decide whether the **Stopword Rule** below applies here. |

**• R2 Stopword Rule**: The system identifies **stop words** prior to the search. The stop words are (separated by a comma): a,able,about,across,after,all,almost,also,am,among,an,and,any,are,as,at,be,because,been,but,by,can,cannot,could,dear,did,do,does,either,else,ever,every,for,from,get,got,had,has,have,he,her,hers,him,his,how,however,i,if,in,into,is,it,its,just,least,let,like,likely,may,me,might,most,must,my,neither,no,nor,not,of,off,often,on,only,or,other,our,own,rather,said,say,says,she,should,since,so,some,than,that,the,their,them,then,there,these,they,this,tis,to,too,twas,us,wants,was,we,were,what,when,where,which,while,who,whom,why,will,with,would,yet,you,your

---

**Implementation Notes:**

This UC must be implemented by taking advantage of the Strategy Design Pattern.

Custom context 1: Stop and Bus Search

Custom context 2: Notification Search
