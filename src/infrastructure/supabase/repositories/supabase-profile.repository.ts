import { Injectable, Logger } from '@nestjs/common';
import { IProfileRepository } from '../../../core/interfaces/profile-repository.interface';
import { Profile, ProfilePii } from '../../../core/domain/profile.entity';
import { SupabaseService } from '../supabase.service';

@Injectable()
export class SupabaseProfileRepository implements IProfileRepository {
  private readonly logger = new Logger(SupabaseProfileRepository.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async findById(id: string): Promise<Profile | null> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.error(`Error finding profile by id: ${error.message}`);
      return null;
    }
    return data as Profile | null;
  }

  async findByAuthUserId(authUserId: string): Promise<Profile | null> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('profiles')
      .select('*')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `Error finding profile by auth_user_id: ${error.message}`,
      );
      return null;
    }
    return data as Profile | null;
  }

  async findByPassportSlug(slug: string): Promise<Profile | null> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('profiles')
      .select('*')
      .eq('passport_slug', slug)
      .maybeSingle();

    if (error) {
      this.logger.error(`Error finding profile by slug: ${error.message}`);
      return null;
    }
    return data as Profile | null;
  }

  async createProfile(profile: Partial<Profile>): Promise<Profile> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('profiles')
      .insert(profile)
      .select()
      .single();

    if (error) {
      this.logger.error(`Error creating profile: ${error.message}`);
      throw new Error(error.message);
    }
    return data as Profile;
  }

  async updateProfile(id: string, updates: Partial<Profile>): Promise<Profile> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Error updating profile: ${error.message}`);
      throw new Error(error.message);
    }
    return data as Profile;
  }

  async savePii(pii: ProfilePii): Promise<void> {
    const { error } = await this.supabaseService
      .getAdminClient()
      .schema('libreta_private')
      .from('profile_pii')
      .upsert(pii);

    if (error) {
      this.logger.error(`Error saving PII: ${error.message}`);
      throw new Error(error.message);
    }
  }

  async getPii(profileId: string): Promise<ProfilePii | null> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .schema('libreta_private')
      .from('profile_pii')
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle();

    if (error) {
      this.logger.error(`Error fetching PII: ${error.message}`);
      return null;
    }
    return data as ProfilePii | null;
  }

  async deletePii(profileId: string): Promise<void> {
    const { error } = await this.supabaseService
      .getAdminClient()
      .schema('libreta_private')
      .from('profile_pii')
      .delete()
      .eq('profile_id', profileId);

    if (error) {
      this.logger.error(`Error deleting PII for Habeas Data: ${error.message}`);
      throw new Error(error.message);
    }
  }
}
