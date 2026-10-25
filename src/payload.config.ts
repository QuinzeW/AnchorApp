import path from 'path'
import { buildFigmaConfig } from '@payloadcms/figma'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
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
        { widgetSlug: 'activity', width: 'full' },
        { widgetSlug: 'collections', width: 'full' },
      ],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  i18n: {
    fallbackLanguage: 'fr',
    supportedLanguages: { 'fr': adminLanguage },
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
  plugins: [mcpPlugin({})],
  figma: {},
}

export default (() => {
  const payloadConfig = config as any

  try {
    return buildFigmaConfig(payloadConfig)
  } catch (error) {
    if (process.env.FIGMA_EID) {
      throw error
    }

    return buildConfig(payloadConfig)
  }
})()
