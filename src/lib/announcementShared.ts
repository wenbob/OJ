export type AnnouncementItem = {
  id: number;
  title: string;
  body?: string;
  publishedAt: string;
  withdrawnAt: string | null;
  publisherName: string;
  read: boolean;
};
export type AnnouncementList = {
  items: AnnouncementItem[];
  page: number;
  totalPages: number;
  total: number;
};
export type AnnouncementPending = {
  announcement: AnnouncementItem | null;
  unreadCount: number;
  blockedByExam: boolean;
};
