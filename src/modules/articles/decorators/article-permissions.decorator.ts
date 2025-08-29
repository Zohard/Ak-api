import { SetMetadata } from '@nestjs/common';

export const ARTICLE_PERMISSIONS_KEY = 'article_permissions';

export const CanWriteArticles = () =>
  SetMetadata(ARTICLE_PERMISSIONS_KEY, 'write');
export const CanEditArticles = () =>
  SetMetadata(ARTICLE_PERMISSIONS_KEY, 'edit');
export const CanModerateComments = () =>
  SetMetadata(ARTICLE_PERMISSIONS_KEY, 'moderate');
export const CanManageCategories = () =>
  SetMetadata(ARTICLE_PERMISSIONS_KEY, 'manage');
export const CanPublishArticles = () =>
  SetMetadata(ARTICLE_PERMISSIONS_KEY, 'publish');
export const CanDeleteArticles = () =>
  SetMetadata(ARTICLE_PERMISSIONS_KEY, 'delete');
