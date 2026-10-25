import path from 'path'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { fr as adminLanguage } from '@payloadcms/translations/languages/fr'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { Admins } from './collections/Admins'
import { Media } from './collections/Media'
import { Folders } from './collections/Folders'
import { Tags } from './collections/Tags'
import { Posts } from './collections/Posts'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const config = {
  admin: {
    user: Admins.slug,
    constrainWidth: true,
    dashboard: {
      widgets: [],
      defaultLayout: [
        {
          widgetSlug: 'activity' as const,
          width: 'full' as const,
        },
        {
          widgetSlug: 'collections' as const,
          width: 'full' as const,
        },
      ],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  i18n: {
    fallbackLanguage: 'fr',
    supportedLanguages: { fr: adminLanguage },
  },
  collections: [Admins, Media, Folders, Tags, Posts],
  localization: {
    locales: [{ code: 'en', label: 'English' }],
    fallback: true,
    defaultLocale: 'en',
  },
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteAdapter({
    client: {
      url: 'file:./payload-local.db',
    },
  }),
  secret: process.env.PAYLOAD_SECRET || 'local-only-secret-change-me',
}

export default buildConfig(config as any)
