export type UserProfile = {
  username: string;
  usernameLower: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  pronouns?: string;
  bannerUrl?: string;
  bannerColor?: string;
  accentColor?: string;
  customStatus?: string;
  customStatusEmoji?: string;
  badges?: string[];
  title?: string;
  decoration?: string;
  status?: "online" | "idle" | "dnd" | "offline" | "invisible";
  statusText?: string;
  createdAt: number;
};

export type Server = {
  id: string;
  name: string;
  iconUrl?: string;
  bannerUrl?: string;
  description?: string;
  ownerId: string;
  createdAt: number;
  memberCount?: number;
};

export type Category = {
  id: string;
  name: string;
  position: number;
  collapsed?: boolean;
};

export type Channel = {
  id: string;
  name: string;
  type: "text" | "voice" | "announcement" | "stage" | "forum";
  position: number;
  topic?: string;
  categoryId?: string | null;
  slowmode?: number;
  nsfw?: boolean;
};

export type Role = {
  id: string;
  name: string;
  color?: string;
  position: number;
  permissions: string[];
  hoist?: boolean;
  mentionable?: boolean;
  memberCount?: number;
};

export type Attachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
};

export type Reaction = {
  emoji: string;
  count: number;
  me: boolean;
  users: string[];
};

export type PollOption = {
  id: string;
  text: string;
  votes: number;
};

export type Poll = {
  id: string;
  question: string;
  options: PollOption[];
  endsAt?: number;
  allowMultiple?: boolean;
  totalVotes: number;
};

export type ChatMessage = {
  id: string;
  serverId: string;
  channelId: string;
  authorId: string;
  authorName?: string;
  content: string;
  createdAt: number;
  editedAt?: number;
  replyTo?: { id: string; authorName?: string; content: string } | null;
  reactions?: Record<string, Reaction>;
  attachments?: Attachment[];
  pinned?: boolean;
  isAiTwin?: boolean;
  twinOfUid?: string;
  poll?: Poll | null;
  threadId?: string | null;
  mentions?: string[];
};

export type DMThread = {
  id: string;
  participants: Record<string, boolean>;
  createdAt: number;
  lastMessageAt?: number;
};

export type DMMessage = {
  id: string;
  authorId: string;
  content: string;
  createdAt: number;
  replyTo?: string | null;
};

export type Presence = {
  status: "online" | "idle" | "dnd" | "offline";
  lastChanged: number;
};

export type TypingIndicator = {
  uid: string;
  username: string;
  timestamp: number;
};

export type Invite = {
  code: string;
  serverId: string;
  createdBy: string;
  createdAt: number;
  maxUses?: number;
  uses: number;
  expiresAt?: number;
};

export type Friend = {
  uid: string;
  username: string;
  displayName: string;
  status: Presence["status"];
};
