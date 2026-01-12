export interface SmfMessage {
  id: number;
  thread_id: number;
  sender_id: number;
  sender_name: string;
  sender_username?: string;
  subject: string;
  message: string;
  created_at: string;
  timestamp: number;
  is_read: number;
  is_new: number;
  bcc?: number;
  recipients?: string;
  is_important?: number;
}

export interface MessageUser {
  id: number;
  username: string;
  displayName: string;
}

export interface MessageResponse {
  success: boolean;
  messageId?: number;
  threadId?: number;
  error?: string;
}

export interface ConversationMessage {
  id: number;
  thread_id: number;
  sender_id: number;
  sender_name: string;
  sender_username: string;
  recipient_id: number;
  recipient_username: string;
  subject: string;
  message: string;
  created_at: string;
  is_read: number;
  conversation_url?: string;
}