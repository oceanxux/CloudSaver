export interface ResourceItem {
  title: string;
  channel: string;
  channelId?: string;
  image?: string;
  cloudLinks: string[];
  tags?: string[];
  content?: string;
  pubDate: string;
  cloudType: string;
  messageId?: string;
  isLastMessage?: boolean;
  isSupportSave?: boolean;
  sourceName?: string;
  articleUrl?: string;
}

export interface Resource {
  list: ResourceItem[];
  displayList?: boolean;
  supportsLoadMore?: boolean;
  channelInfo: {
    id?: string;
    name: string;
    channelLogo: string;
  };
  id: string;
}

export interface ShareInfo {
  isChecked?: boolean;
}

export interface ShareInfoResponse {
  list: ShareInfo[];
  fileSize?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
