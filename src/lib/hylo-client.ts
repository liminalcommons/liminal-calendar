import type { HyloEvent, HyloMeResponse } from '../types/hylo-types';

const HYLO_GRAPHQL_URL = 'https://www.hylo.com/noo/graphql';

export const LIMINAL_COMMONS_GROUP_ID = '41955';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function hyloGraphQL<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(HYLO_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Hylo GraphQL error: ${res.status} ${res.statusText}`);
  }

  const json: GraphQLResponse<T> = await res.json();
  if (json.errors?.length) {
    throw new Error(`Hylo GraphQL: ${json.errors[0].message}`);
  }
  if (!json.data) {
    throw new Error('Hylo GraphQL: empty response');
  }
  return json.data;
}

// --- Queries ---

const EVENTS_QUERY = `
  query GroupEvents($groupId: ID!, $filter: String, $first: Int) {
    group(id: $groupId) {
      posts(filter: $filter, first: $first, sortBy: "start_time", order: "asc") {
        items {
          id title details type createdAt updatedAt

          creator { id name avatarUrl }
          startTime endTime timezone location
          myEventResponse
          eventInvitations {
            total
            items {
              person { id name avatarUrl location }
              response
            }
          }
          topics { id name }
        }
      }
    }
  }
`;

const ME_QUERY = `
  query Me {
    me {
      id name email avatarUrl hasRegistered
      memberships {
        group { id name slug description memberCount }
      }
    }
  }
`;

const CREATE_POST_MUTATION = `
  mutation CreatePost($data: PostInput!) {
    createPost(data: $data) {
      id title details type createdAt
      creator { id name avatarUrl }
      startTime endTime timezone location
      myEventResponse
      eventInvitations { total }
    }
  }
`;

const UPDATE_POST_MUTATION = `
  mutation UpdatePost($id: ID!, $data: PostInput!) {
    updatePost(id: $id, data: $data) {
      id title details type createdAt updatedAt
      creator { id name avatarUrl }
      startTime endTime timezone location
      myEventResponse
    }
  }
`;

const DELETE_POST_MUTATION = `
  mutation DeletePost($id: ID!) {
    deletePost(id: $id) { success }
  }
`;

const RSVP_MUTATION = `
  mutation RespondToEvent($id: ID!, $response: String!) {
    respondToEvent(id: $id, response: $response) { success }
  }
`;

const ATTENDEES_QUERY = `
  query EventAttendees($id: ID!) {
    post(id: $id) {
      id
      creator { id name avatarUrl }
      eventInvitations {
        total
        items {
          id
          person { id name avatarUrl }
          response
        }
      }
    }
  }
`;

const SINGLE_EVENT_QUERY = `
  query SingleEvent($id: ID!) {
    post(id: $id) {
      id title details type createdAt updatedAt
      creator { id name avatarUrl }
      startTime endTime timezone location
      myEventResponse
      eventInvitations {
        total
        items {
          person { id name avatarUrl location }
          response
        }
      }
      topics { id name }
    }
  }
`;

const MEMBERS_QUERY = `
  query GroupMembers($groupId: ID!, $search: String, $first: Int) {
    group(id: $groupId) {
      members(first: $first, search: $search) {
        items { id name avatarUrl location }
      }
    }
  }
`;

// --- Public API ---

export interface HyloMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  location: string | null;
}

export async function getGroupMembers(
  token: string,
  groupId: string,
  search?: string,
  first = 20,
): Promise<HyloMember[]> {
  const data = await hyloGraphQL<{ group: { members: { items: HyloMember[] } } }>(
    token, MEMBERS_QUERY, { groupId, search, first },
  );
  return data.group.members.items;
}

export async function getEvents(token: string, groupId: string): Promise<HyloEvent[]> {
  const data = await hyloGraphQL<{ group: { posts: { items: HyloEvent[] } } }>(
    token, EVENTS_QUERY, { groupId, filter: 'event', first: 100 },
  );
  return data.group.posts.items;
}

export async function getEvent(token: string, eventId: string): Promise<HyloEvent> {
  const data = await hyloGraphQL<{ post: HyloEvent | null }>(
    token, SINGLE_EVENT_QUERY, { id: eventId },
  );
  if (!data.post) throw new Error(`Event not found: ${eventId}`);
  return data.post;
}

export async function getCurrentUser(token: string): Promise<HyloMeResponse> {
  const data = await hyloGraphQL<{ me: HyloMeResponse }>(token, ME_QUERY);
  return data.me;
}

export async function createEvent(
  token: string,
  groupId: string,
  eventData: {
    title: string;
    details?: string;
    startTime: Date;
    endTime: Date;
    timezone?: string;
    location?: string;
    eventInviteeIds?: string[];
    imageUrl?: string;
  },
): Promise<HyloEvent> {
  const postInput: Record<string, unknown> = {
    groupIds: [groupId],
    title: eventData.title,
    type: 'event',
    startTime: eventData.startTime.getTime(), // Unix ms
    endTime: eventData.endTime.getTime(),
    timezone: eventData.timezone,
  };
  if (eventData.details) postInput.details = eventData.details;
  if (eventData.location) postInput.location = eventData.location;
  if (eventData.eventInviteeIds?.length) postInput.eventInviteeIds = eventData.eventInviteeIds;
  if (eventData.imageUrl) postInput.imageUrl = eventData.imageUrl;

  const data = await hyloGraphQL<{ createPost: HyloEvent }>(
    token, CREATE_POST_MUTATION, { data: postInput },
  );
  return data.createPost;
}

export async function updateEvent(
  token: string,
  eventId: string,
  updates: {
    title?: string;
    details?: string;
    startTime?: Date;
    endTime?: Date;
    timezone?: string;
    location?: string;
    imageUrl?: string;
  },
): Promise<HyloEvent> {
  const postInput: Record<string, unknown> = {};
  if (updates.title !== undefined) postInput.title = updates.title;
  if (updates.details !== undefined) postInput.details = updates.details;
  if (updates.startTime) postInput.startTime = updates.startTime.getTime();
  if (updates.endTime) postInput.endTime = updates.endTime.getTime();
  if (updates.timezone) postInput.timezone = updates.timezone;
  if (updates.location !== undefined) postInput.location = updates.location;
  if (updates.imageUrl !== undefined) postInput.imageUrl = updates.imageUrl;

  const data = await hyloGraphQL<{ updatePost: HyloEvent }>(
    token, UPDATE_POST_MUTATION, { id: eventId, data: postInput },
  );
  return data.updatePost;
}

export async function deleteEvent(token: string, eventId: string): Promise<boolean> {
  const data = await hyloGraphQL<{ deletePost: { success: boolean } }>(
    token, DELETE_POST_MUTATION, { id: eventId },
  );
  return data.deletePost.success;
}

export async function respondToEvent(
  token: string,
  eventId: string,
  response: 'yes' | 'interested' | 'no',
): Promise<boolean> {
  const data = await hyloGraphQL<{ respondToEvent: { success: boolean } }>(
    token, RSVP_MUTATION, { id: eventId, response },
  );
  return data.respondToEvent.success;
}

export async function getEventAttendees(
  token: string,
  eventId: string,
): Promise<{ creator: HyloEvent['creator']; invitations: HyloEvent['eventInvitations'] }> {
  const data = await hyloGraphQL<{
    post: { creator: HyloEvent['creator']; eventInvitations: HyloEvent['eventInvitations'] };
  }>(token, ATTENDEES_QUERY, { id: eventId });
  return { creator: data.post.creator, invitations: data.post.eventInvitations };
}
