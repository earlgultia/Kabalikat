import { useDeferredValue, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Archive, FilePlus2, FolderPlus, Search, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import {
  createArchiveFolder, createArchiveUploadIntent, hasPermission, listArchiveFolders,
  registerArchiveDocument, saveArchiveText, searchArchiveDocuments,
} from './data'
import { ocrAdapter } from './ocr-adapter'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'

const uploadSchema = z.object({
  description: z.string().trim().max(1000),
  category: z.string().trim().min(1).max(60),
  folderId: z.string(),
})
const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const maximumFileBytes = 20 * 1024 * 1024

function fileSize(bytes: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / 1024) + ' KB'
}

export function ArchivePage() {
  const { membership } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const canRead = useQuery({ queryKey: ['permission', tenantId, 'archive.read'], queryFn: () => hasPermission(tenantId, 'archive.read'), enabled: Boolean(tenantId) })
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'archive.manage'], queryFn: () => hasPermission(tenantId, 'archive.manage'), enabled: Boolean(tenantId) })
  const folders = useQuery({ queryKey: ['archive-folders', tenantId], queryFn: () => listArchiveFolders(tenantId), enabled: Boolean(tenantId && canRead.data) })
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [folderId, setFolderId] = useState('')
  const documents = useQuery({
    queryKey: ['archive-documents', tenantId, deferredQuery, folderId],
    queryFn: () => searchArchiveDocuments(tenantId, deferredQuery, folderId),
    enabled: Boolean(tenantId && canRead.data),
  })
  const [draftText, setDraftText] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function addFolder() {
    const name = window.prompt('Name this folder:')
    if (!name?.trim()) return
    const parsed = z.string().trim().min(1).max(80).safeParse(name)
    if (!parsed.success || /[\\/]/.test(name)) { setError('Folder names must be 1 to 80 characters and cannot contain a slash.'); return }
    setError(''); setMessage('')
    try {
      await createArchiveFolder(tenantId, parsed.data, folderId || null)
      await queryClient.invalidateQueries({ queryKey: ['archive-folders', tenantId] })
      setMessage('Folder created.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create this folder.') }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('')
    const form = event.currentTarget
    const parsed = uploadSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    const file = (form.elements.namedItem('file') as HTMLInputElement | null)?.files?.[0]
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the file details.'); return }
    if (!file || !allowedMimeTypes.has(file.type) || file.size < 1 || file.size > maximumFileBytes) {
      setError('Choose a PDF, JPEG, or PNG file smaller than 20 MB.')
      return
    }
    if (!supabase) { setError('Supabase is not configured.'); return }
    const safeName = file.name.replaceAll('\\', '_').replaceAll('/', '_')
      .split('').map((character) => character.charCodeAt(0) < 32 ? '_' : character).join('').trim()
    if (!safeName || safeName === '.' || safeName === '..' || safeName.length > 180) {
      setError('The file name is invalid or too long.')
      return
    }
    setBusy(true)
    const documentId = window.crypto.randomUUID()
    try {
      const path = await createArchiveUploadIntent({
        tenantId, documentId, folderId: parsed.data.folderId, fileName: safeName,
        description: parsed.data.description, category: parsed.data.category,
        mimeType: file.type, fileSize: file.size,
      })
      const { error: uploadError } = await supabase.storage.from('barangay-archive').upload(path, file, {
        cacheControl: '3600', contentType: file.type, upsert: false,
      })
      if (uploadError) throw uploadError
      await registerArchiveDocument(documentId)
      await queryClient.invalidateQueries({ queryKey: ['archive-documents', tenantId] })
      setMessage('File added to the private barangay archive.')
      form.reset()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to upload this file.') }
    finally { setBusy(false) }
  }

  async function openFile(path: string) {
    if (!supabase) return
    setError('')
    try {
      const { data, error: linkError } = await supabase.storage.from('barangay-archive').createSignedUrl(path, 60)
      if (linkError) throw linkError
      const link = document.createElement('a')
      link.href = data.signedUrl
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.click()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to open this file.') }
  }

  async function saveText(documentId: string, reviewed: boolean) {
    const text = draftText[documentId] ?? documents.data?.find((item) => item.id === documentId)?.extracted_text ?? ''
    if (reviewed && !text.trim()) { setError('Add searchable text before marking it reviewed.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await saveArchiveText(documentId, text, reviewed)
      await queryClient.invalidateQueries({ queryKey: ['archive-documents', tenantId] })
      setMessage(reviewed ? 'Searchable text marked as reviewed.' : 'Searchable text saved as a draft.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save searchable text.') }
    finally { setBusy(false) }
  }

  return <section className="operation-page">
    <PageHeading title="Barangay archive" description="Store and search private community files, with tenant permissions enforced on storage and metadata.">
      {canManage.data && <button className="button outline" onClick={() => void addFolder()}><FolderPlus size={16} />New folder</button>}
    </PageHeading>
    {!tenantId && <EmptyNotice title="Choose a barangay workspace" detail="Select an active barangay membership to open its private archive." />}
    {Boolean(tenantId) && canRead.isPending && <LoadingNotice compact />}
    {canRead.error && <ErrorNotice message="Your archive access could not be checked. Refresh the page or contact your barangay administrator." />}
    {canManage.error && <ErrorNotice message="Archive management access could not be checked. Upload and folder controls are unavailable until it can be verified." />}
    {Boolean(tenantId) && !canRead.isPending && !canRead.error && !canRead.data && <div className="ops-panel archive-access"><ShieldCheck size={20} /><div><strong>Archive access is restricted</strong><p>Your current role cannot read this barangay archive. Contact your barangay administrator if you need access.</p></div></div>}
    {message && <div className="ops-success"><Archive size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {canRead.data && <>
      <div className="archive-toolbar">
        <label className="archive-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search file names and reviewed text" aria-label="Search archive" /></label>
        <label className="archive-folder-select">Folder<select value={folderId} onChange={(event) => setFolderId(event.target.value)}><option value="">All folders</option>{folders.data?.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
      </div>
      {canManage.data && <form className="ops-panel ops-form archive-upload" onSubmit={(event) => void upload(event)}>
        <div className="ops-panel-heading"><div><h2>Add a file</h2><p>Original uploads stay private. Supported formats: PDF, JPEG, and PNG up to 20 MB.</p></div><FilePlus2 size={19} /></div>
        <div className="ops-form-grid">
          <label className="span-two">Choose file<input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required /></label>
          <label>Folder<select name="folderId" defaultValue={folderId}><option value="">Archive root</option>{folders.data?.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
          <label>Category<input name="category" defaultValue="General" required maxLength={60} /></label>
          <label className="span-two">Description <span className="field-hint">Optional</span><input name="description" maxLength={1000} /></label>
        </div>
        <div className="ops-form-actions"><span className="field-hint">OCR provider: {ocrAdapter.provider}. Searchable text can be added manually and reviewed.</span><button className="button primary" disabled={busy}>{busy ? 'Uploading...' : 'Upload file'}</button></div>
      </form>}
      {documents.isPending ? <LoadingNotice /> : documents.error ? <ErrorNotice message={documents.error.message} /> : documents.data?.length ?
        <div className="archive-document-list">{documents.data.map((item) => <article className="ops-panel archive-document" key={item.id}>
          <div className="archive-document-top"><div className="archive-file-icon"><Archive size={19} /></div><div className="archive-file-details"><strong>{item.file_name}</strong><p>{item.description || item.category}</p><small>{item.category} · {fileSize(item.file_size)} · {new Date(item.created_at).toLocaleDateString()}</small></div><StatusPill status={item.text_status.replaceAll('_', ' ')} /></div>
          <div className="archive-document-actions"><button className="button outline" onClick={() => void openFile(item.storage_path)}>Open private file</button>{canManage.data && <span className="field-hint">Manual text entry</span>}</div>
          {canManage.data && <details className="archive-text-editor"><summary>Searchable text <span className="field-hint">{ocrAdapter.available ? 'OCR available' : 'OCR not configured'}</span></summary>
            {!ocrAdapter.available && <p className="field-hint">Automatic text extraction is unavailable. Do not treat manually entered text as OCR output.</p>}
            <textarea value={draftText[item.id] ?? item.extracted_text} maxLength={200000} rows={5} onChange={(event) => setDraftText((current) => ({ ...current, [item.id]: event.target.value }))} aria-label={'Searchable text for ' + item.file_name} />
            <div className="archive-text-actions"><button className="button outline" disabled={busy} onClick={() => void saveText(item.id, false)}>Save draft text</button><button className="button primary" disabled={busy || !(draftText[item.id] ?? item.extracted_text).trim()} onClick={() => void saveText(item.id, true)}>Mark reviewed</button></div>
          </details>}
        </article>)}</div> : <EmptyNotice title="No archive files found" detail={query ? 'Try another search term or folder.' : 'Files uploaded for this barangay will appear here.'} />}
      <p className="archive-limit-note">Search displays the newest 200 matching files. Private links expire after one minute.</p>
    </>}
  </section>
}
