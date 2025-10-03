-- Restore missing poll metadata for 97 polls
-- This script reconstructs smf_polls entries from existing poll_choices and log_polls data

INSERT INTO smf_polls (
    id_poll,
    question,
    voting_locked,
    max_votes,
    expire_time,
    hide_results,
    change_vote,
    id_member,
    poster_name,
    guest_vote,
    num_guest_voters,
    reset_poll
)
SELECT
    t.id_poll,
    m.subject as question,
    0 as voting_locked, -- Assume unlocked
    COALESCE(
        (SELECT MAX(vote_count)
         FROM (SELECT id_member, COUNT(*) as vote_count
               FROM smf_log_polls
               WHERE id_poll = t.id_poll
               GROUP BY id_member) vc),
        1
    ) as max_votes, -- Calculate max votes from actual voting behavior
    0 as expire_time, -- No expiration
    0 as hide_results, -- Show results
    1 as change_vote, -- Allow change vote
    t.id_member_started as id_member,
    m.poster_name,
    0 as guest_vote, -- No guest voting (can be updated if needed)
    0 as num_guest_voters,
    0 as reset_poll
FROM smf_topics t
LEFT JOIN smf_messages m ON t.id_first_msg = m.id_msg
LEFT JOIN smf_polls p ON t.id_poll = p.id_poll
WHERE t.id_poll > 0
  AND p.id_poll IS NULL
  AND EXISTS (SELECT 1 FROM smf_poll_choices pc WHERE pc.id_poll = t.id_poll);

-- Verify the restoration
SELECT
    'Restored polls' as status,
    COUNT(*) as count
FROM smf_polls
WHERE id_poll IN (
    SELECT DISTINCT id_poll
    FROM smf_poll_choices
    WHERE id_poll NOT IN (SELECT id_poll FROM smf_polls WHERE id_poll IS NOT NULL)
);
