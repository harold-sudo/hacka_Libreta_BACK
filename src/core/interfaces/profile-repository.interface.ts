import { Profile, ProfilePii } from '../domain/profile.entity';

export interface IProfileRepository {
  findById(id: string): Promise<Profile | null>;
  findByAuthUserId(authUserId: string): Promise<Profile | null>;
  findByPassportSlug(slug: string): Promise<Profile | null>;
  createProfile(profile: Partial<Profile>): Promise<Profile>;
  updateProfile(id: string, updates: Partial<Profile>): Promise<Profile>;
  savePii(pii: ProfilePii): Promise<void>;
  getPii(profileId: string): Promise<ProfilePii | null>;
  deletePii(profileId: string): Promise<void>; // Para Derecho al Olvido (Habeas Data)
}
