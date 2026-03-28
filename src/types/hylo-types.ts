// Hylo GraphQL response types

export interface HyloCreator {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface HyloInvitation {
  id?: string;
  person: {
    id: string;
    name: string;
    avatarUrl?: string;
    location?: string;
  };
  response: string; // 'yes' | 'interested' | 'no' | null
}

export interface HyloEvent {
  id: string;
  title: string;
  details?: string;
  type: string;
  createdAt: string;
  updatedAt?: string;
  creator: HyloCreator;
  startTime: string;
  endTime?: string;
  timezone?: string;
  location?: string;
  imageUrl?: string;
  myEventResponse?: string; // 'yes' | 'interested' | 'no' | null
  eventInvitations?: {
    total: number;
    items: HyloInvitation[];
  };
  topics?: Array<{ id: string; name: string }>;
}

export interface HyloMeResponse {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  hasRegistered?: boolean;
  memberships?: Array<{
    group: {
      id: string;
      name: string;
      slug: string;
      description?: string;
      memberCount?: number;
    };
  }>;
}
