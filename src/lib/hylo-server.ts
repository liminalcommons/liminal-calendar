import { auth } from '../../auth';

export async function getHyloToken(): Promise<string | null> {
  const session = await auth();
  return (session as any)?.accessToken || null;
}
