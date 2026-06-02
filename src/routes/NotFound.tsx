import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="card text-center py-12">
      <div className="text-3xl mb-2">🤔</div>
      <div className="text-sm text-slate-400">{t('notFound.title')}</div>
      <Link to="/" className="btn-primary mt-4">{t('notFound.backHome')}</Link>
    </div>
  )
}
