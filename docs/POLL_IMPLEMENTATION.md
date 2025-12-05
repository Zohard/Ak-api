# Poll System Implementation Guide

## Backend Implementation Complete ✅

The poll system has been fully implemented for the `/forums` API. Here's what was added:

### Database Models (Prisma)
- ✅ `SmfPoll` - Main poll information
- ✅ `SmfPollChoice` - Poll options/choices
- ✅ `SmfLogPoll` - Vote tracking
- ✅ Poll relation added to `SmfTopic`
- ✅ 97 missing polls restored in database

### API Endpoints

#### 1. **Create Topic with Poll**
```typescript
POST /forums/topics
Authorization: Bearer <token>

{
  "boardId": 3,
  "subject": "Favorite Character Poll",
  "body": "Vote for your favorite!",
  "poll": {
    "question": "Who is your favorite character?",
    "choices": [
      { "label": "Naruto" },
      { "label": "Sasuke" },
      { "label": "Sakura" }
    ],
    "maxVotes": 1,           // Max choices per user (default: 1)
    "changeVote": true,       // Allow vote changes (default: false)
    "guestVote": false,       // Allow guest voting (default: false)
    "hideResults": 0,         // 0=always show, 1=show after vote, 2=show after expire
    "expireTime": 1735689600  // Unix timestamp (optional)
  }
}

Response:
{
  "topicId": 12345,
  "messageId": 67890,
  "subject": "Favorite Character Poll",
  "pollId": 200
}
```

#### 2. **Get Topic with Poll**
```typescript
GET /forums/topics/:topicId

Response:
{
  "topic": {
    "id": 8305,
    "subject": "Tournoi de Personnages...",
    "hasPoll": true,
    ...
  },
  "poll": {
    "id": 133,
    "question": "Tournoi de Personnages d'Animes et de Mangas",
    "votingLocked": 0,
    "maxVotes": 25,
    "totalVotes": 31,
    "totalVoters": 5,
    "choices": [
      {
        "id": 0,
        "label": "Zweig, Ulgar",
        "votes": 1,
        "percentage": 3,
        "isUserChoice": false
      },
      {
        "id": 17,
        "label": "Killua Zoldyck",
        "votes": 3,
        "percentage": 10,
        "isUserChoice": true  // If user voted for this
      },
      ...
    ],
    "userVoted": true,
    "userChoices": [17, 28],  // User's selected choices
    "canVote": false,         // Can user vote now?
    "isExpired": false
  },
  "posts": [...]
}
```

#### 3. **Vote on Poll**
```typescript
POST /forums/polls/:pollId/vote
Authorization: Bearer <token>

{
  "choices": [17, 28]  // Array of choice IDs (max: poll.maxVotes)
}

Response: Updated poll data with user's vote
```

#### 4. **Get Poll Data**
```typescript
GET /forums/polls/:pollId
Authorization: Bearer <token> (optional)

Response: Poll data (same as in topic response)
```

#### 5. **Board Topics List**
```typescript
GET /forums/boards/:boardId

Response:
{
  "topics": [
    {
      "id": 8305,
      "subject": "Tournoi de Personnages...",
      "hasPoll": true,  // Show poll icon in UI
      "isSticky": false,
      "locked": false,
      ...
    }
  ]
}
```

## Frontend Integration

### 1. **Show Poll Icon in Topic List**
```vue
<!-- In board topic list -->
<div v-for="topic in topics" :key="topic.id">
  <i v-if="topic.hasPoll" class="poll-icon">📊</i>
  <a :href="`/forums/topic/${topic.id}`">{{ topic.subject }}</a>
</div>
```

### 2. **Display Poll in Topic View**
```vue
<template>
  <div v-if="poll" class="poll-container">
    <h3>{{ poll.question }}</h3>

    <!-- Show voting form if user can vote -->
    <div v-if="poll.canVote && !poll.userVoted" class="poll-vote">
      <div v-for="choice in poll.choices" :key="choice.id">
        <label>
          <input
            :type="poll.maxVotes > 1 ? 'checkbox' : 'radio'"
            :name="poll.maxVotes > 1 ? 'poll-choice[]' : 'poll-choice'"
            :value="choice.id"
            v-model="selectedChoices"
          />
          {{ choice.label }}
        </label>
      </div>
      <button @click="votePoll">Vote</button>
    </div>

    <!-- Show results if user has voted or cannot vote -->
    <div v-else class="poll-results">
      <div v-for="choice in poll.choices" :key="choice.id" class="poll-choice">
        <div class="choice-label">
          {{ choice.label }}
          <span v-if="choice.isUserChoice" class="your-vote">✓</span>
        </div>
        <div class="choice-bar">
          <div class="bar-fill" :style="{ width: choice.percentage + '%' }"></div>
        </div>
        <div class="choice-stats">
          {{ choice.votes }} votes ({{ choice.percentage }}%)
        </div>
      </div>
      <div class="poll-total">
        Total: {{ poll.totalVotes }} votes from {{ poll.totalVoters }} voters
      </div>
      <button v-if="poll.changeVote && poll.userVoted" @click="changeVote">
        Change Vote
      </button>
    </div>

    <!-- Poll status messages -->
    <div v-if="poll.isExpired" class="poll-expired">
      This poll has expired
    </div>
    <div v-if="poll.votingLocked" class="poll-locked">
      Voting is locked
    </div>
  </div>

  <!-- Message content below poll -->
  <div class="message-content">
    {{ firstPost.body }}
  </div>
</template>

<script>
export default {
  data() {
    return {
      selectedChoices: []
    }
  },
  methods: {
    async votePoll() {
      try {
        const response = await this.$axios.post(
          `/forums/polls/${this.poll.id}/vote`,
          { choices: this.selectedChoices }
        );
        // Update poll data with response
        this.poll = response.data;
      } catch (error) {
        alert(error.response?.data?.message || 'Vote failed');
      }
    },
    changeVote() {
      // Reset to voting mode
      this.selectedChoices = this.poll.userChoices || [];
    }
  }
}
</script>

<style scoped>
.poll-container {
  background: #f5f5f5;
  padding: 20px;
  margin-bottom: 20px;
  border-radius: 8px;
}

.choice-bar {
  background: #ddd;
  height: 20px;
  border-radius: 4px;
  margin: 5px 0;
}

.bar-fill {
  background: #4CAF50;
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}

.your-vote {
  color: green;
  font-weight: bold;
}
</style>
```

### 3. **Create Poll Button**
```vue
<!-- In board header -->
<div class="buttonlist floatright">
  <ul>
    <li>
      <a @click="showCreateTopic(false)" class="button_strip_new_topic">
        <span>Nouveau sujet</span>
      </a>
    </li>
    <li>
      <a @click="showCreateTopic(true)" class="button_strip_post_poll">
        <span>Nouveau sondage</span>
      </a>
    </li>
  </ul>
</div>

<script>
export default {
  methods: {
    showCreateTopic(withPoll) {
      this.$router.push({
        path: `/forums/create-topic`,
        query: {
          boardId: this.boardId,
          poll: withPoll ? 'true' : undefined
        }
      });
    }
  }
}
</script>
```

### 4. **Create Topic/Poll Form**
```vue
<template>
  <form @submit.prevent="createTopic">
    <input v-model="form.subject" placeholder="Subject" required />
    <textarea v-model="form.body" placeholder="Message" required></textarea>

    <!-- Poll section (shown if creating poll) -->
    <div v-if="withPoll" class="poll-section">
      <h3>Sondage</h3>
      <input v-model="form.poll.question" placeholder="Poll question" required />

      <div v-for="(choice, index) in form.poll.choices" :key="index">
        <input
          v-model="choice.label"
          :placeholder="`Choice ${index + 1}`"
          required
        />
        <button v-if="index > 1" @click="removeChoice(index)">×</button>
      </div>
      <button type="button" @click="addChoice">Add Choice</button>

      <label>
        <input type="checkbox" v-model="form.poll.changeVote" />
        Allow users to change vote
      </label>

      <label>
        Max votes per user:
        <input type="number" v-model.number="form.poll.maxVotes" min="1" :max="form.poll.choices.length" />
      </label>
    </div>

    <button type="submit">Create {{ withPoll ? 'Poll' : 'Topic' }}</button>
  </form>
</template>

<script>
export default {
  data() {
    return {
      withPoll: this.$route.query.poll === 'true',
      form: {
        boardId: parseInt(this.$route.query.boardId),
        subject: '',
        body: '',
        poll: {
          question: '',
          choices: [
            { label: '' },
            { label: '' }
          ],
          maxVotes: 1,
          changeVote: false
        }
      }
    }
  },
  methods: {
    addChoice() {
      this.form.poll.choices.push({ label: '' });
    },
    removeChoice(index) {
      this.form.poll.choices.splice(index, 1);
    },
    async createTopic() {
      try {
        const payload = {
          boardId: this.form.boardId,
          subject: this.form.subject,
          body: this.form.body
        };

        if (this.withPoll) {
          payload.poll = this.form.poll;
        }

        const response = await this.$axios.post('/forums/topics', payload);
        this.$router.push(`/forums/topic/${response.data.topicId}`);
      } catch (error) {
        alert(error.response?.data?.message || 'Creation failed');
      }
    }
  }
}
</script>
```

## Key Features Implemented

✅ **Multi-choice polls** - Users can select multiple options (up to maxVotes)
✅ **Change vote** - Users can modify their vote if enabled
✅ **Vote tracking** - Tracks who voted for what
✅ **Results visualization** - Shows vote counts and percentages
✅ **Poll icons** - `hasPoll` flag in topic lists
✅ **Poll expiration** - Support for time-limited polls
✅ **Vote locking** - Admin can lock voting
✅ **Guest voting** - Optional guest vote support (in DB, needs cookie implementation)

## Database Reference

For topic 8305 (Poll #133):
- Question: "Tournoi de Personnages d'Animes et de Mangas"
- 30 choices of anime/manga characters
- 31 total votes from 5 voters
- maxVotes: 25 (multi-choice poll)
- All 97 previously missing polls have been restored

## Testing

Test the implementation with topic 8305:
```bash
# Get topic with poll
GET /forums/topics/8305

# Vote on poll (requires auth)
POST /forums/polls/133/vote
{
  "choices": [17, 28]  # Killua and Hange
}
```
