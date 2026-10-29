import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { CheckCircle2, CircleDollarSign, Download, ReceiptText, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import {
  approveFinanceBudget, createFinanceBudget, createFinancialTransaction, createFinancialReceiptDownloadUrl, hasPermission,
  listFinanceBudgetAmendments, listFinanceBudgets, listFinancialAdjustments, listFinancialReceipts, listFinancialTransactions, reviewFinanceBudgetAmendment, reviewFinancialAdjustment, reviewFinancialTransaction,
  recordFinanceReportExport, requestFinanceBudgetAmendment, requestFinancialAdjustment, uploadFinancialReceipt, voidFinancialTransaction,
} from './data'
import { EmptyNotice, ErrorNotice, LoadingNotice, PageHeading, StatusPill } from './shared'
import { formatDateTime } from './format'

const budgetSchema = z.object({ fiscalYear: z.coerce.number().int().min(2000).max(2200), name: z.string().trim().min(3).max(120), amount: z.coerce.number().positive().finite().max(999999999999.99) })
const transactionSchema = z.object({ budgetId: z.string().uuid(), type: z.enum(['income', 'expense']), category: z.string().trim().min(2).max(80), description: z.string().trim().min(3).max(1000), amount: z.coerce.number().positive().finite().max(999999999999.99), date: z.string().date() })
const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const allowedReceiptTypes = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const receiptLimitBytes = 10 * 1024 * 1024
const localDate = (() => { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}` })()

export function FinancePage() {
  const { membership, user } = useAuth()
  const tenantId = membership?.barangay_id ?? ''
  const queryClient = useQueryClient()
  const canRead = useQuery({ queryKey: ['permission', tenantId, 'finance.read'], queryFn: () => hasPermission(tenantId, 'finance.read'), enabled: Boolean(tenantId) })
  const canManage = useQuery({ queryKey: ['permission', tenantId, 'finance.manage'], queryFn: () => hasPermission(tenantId, 'finance.manage'), enabled: Boolean(tenantId) })
  const canApprove = useQuery({ queryKey: ['permission', tenantId, 'finance.approve'], queryFn: () => hasPermission(tenantId, 'finance.approve'), enabled: Boolean(tenantId) })
  const budgets = useQuery({ queryKey: ['finance-budgets', tenantId], queryFn: () => listFinanceBudgets(tenantId), enabled: Boolean(tenantId && canRead.data) })
  const amendments = useQuery({ queryKey: ['finance-budget-amendments', tenantId], queryFn: () => listFinanceBudgetAmendments(tenantId), enabled: Boolean(tenantId && canRead.data) })
  const transactions = useQuery({ queryKey: ['financial-transactions', tenantId], queryFn: () => listFinancialTransactions(tenantId), enabled: Boolean(tenantId && canRead.data) })
  const adjustments = useQuery({ queryKey: ['financial-adjustments', tenantId], queryFn: () => listFinancialAdjustments(tenantId), enabled: Boolean(tenantId && canRead.data) })
  const receipts = useQuery({ queryKey: ['financial-receipts', tenantId], queryFn: () => listFinancialReceipts(tenantId), enabled: Boolean(tenantId && canRead.data) })
  const [budgetForm, setBudgetForm] = useState(false)
  const [transactionForm, setTransactionForm] = useState(false)
  const [amendmentBudget, setAmendmentBudget] = useState('')
  const [adjustmentTransaction, setAdjustmentTransaction] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const thisYear = new Date().getFullYear()
  const [reportFrom, setReportFrom] = useState(`${thisYear}-01-01`)
  const [reportTo, setReportTo] = useState(`${thisYear}-12-31`)

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['finance-budgets', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['finance-budget-amendments', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['financial-transactions', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['financial-adjustments', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['financial-receipts', tenantId] }),
    ])
  }

  async function submitBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('')
    const form = event.currentTarget
    const parsed = budgetSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the budget details.'); return }
    setBusy(true)
    try {
      await createFinanceBudget(tenantId, parsed.data.fiscalYear, parsed.data.name, parsed.data.amount)
      await refresh(); form.reset(); setBudgetForm(false); setMessage('Budget submitted for approval.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit the budget.') }
    finally { setBusy(false) }
  }

  async function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('')
    const form = event.currentTarget
    const parsed = transactionSchema.safeParse(Object.fromEntries(new FormData(form).entries()))
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the transaction details.'); return }
    setBusy(true)
    try {
      await createFinancialTransaction({ budgetId: parsed.data.budgetId, type: parsed.data.type, category: parsed.data.category, description: parsed.data.description, amount: parsed.data.amount, date: parsed.data.date })
      await refresh(); form.reset(); setTransactionForm(false); setMessage('Transaction submitted for independent review.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit the transaction.') }
    finally { setBusy(false) }
  }

  async function approveBudget(id: string) {
    if (!window.confirm('Approve this budget? Only an authorized reviewer who did not create it can approve.')) return
    setBusy(true); setError(''); setMessage('')
    try { await approveFinanceBudget(id); await refresh(); setMessage('Budget approved.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to approve the budget.') }
    finally { setBusy(false) }
  }

  async function submitAmendment(budgetId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form)
    const amount = Number(values.get('amount')); const reason = String(values.get('reason') ?? '').trim()
    if (!Number.isFinite(amount) || amount <= 0 || reason.length < 3 || reason.length > 1000) { setError('Enter a positive revised amount and a reason of at least 3 characters.'); return }
    setBusy(true); setError(''); setMessage('')
    try { await requestFinanceBudgetAmendment(budgetId, amount, reason); await refresh(); setAmendmentBudget(''); setMessage('Budget amendment submitted for independent approval.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit this budget amendment.') }
    finally { setBusy(false) }
  }

  async function reviewAmendment(id: string, approve: boolean) {
    const note = approve ? '' : window.prompt('Reason for rejecting this amendment:') ?? ''
    if (!approve && note.trim().length < 3) return
    if (approve && !window.confirm('Approve this budget amount change? The new amount will apply to future expense checks.')) return
    setBusy(true); setError(''); setMessage('')
    try { await reviewFinanceBudgetAmendment(id, approve, note); await refresh(); setMessage(approve ? 'Budget amount amended and recorded.' : 'Budget amendment rejected with a reason.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to review this budget amendment.') }
    finally { setBusy(false) }
  }

  async function submitAdjustment(transactionId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form)
    const amountChange = Number(values.get('amountChange')); const reason = String(values.get('reason') ?? '').trim()
    if (!Number.isFinite(amountChange) || amountChange === 0 || Math.abs(amountChange) > 999999999999.99 || reason.length < 3 || reason.length > 1000) {
      setError('Enter a nonzero adjustment and a reason of at least 3 characters. Use a negative amount to reduce the entry.'); return
    }
    setBusy(true); setError(''); setMessage('')
    try { await requestFinancialAdjustment(transactionId, amountChange, reason); await refresh(); setAdjustmentTransaction(''); setMessage('Adjustment submitted for independent approval.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit this adjustment.') }
    finally { setBusy(false) }
  }

  async function reviewAdjustment(id: string, approve: boolean) {
    const note = approve ? '' : window.prompt('Reason for rejecting this adjustment:') ?? ''
    if (!approve && note.trim().length < 3) return
    if (approve && !window.confirm('Approve this linked adjustment? The original transaction remains unchanged.')) return
    setBusy(true); setError(''); setMessage('')
    try { await reviewFinancialAdjustment(id, approve, note); await refresh(); setMessage(approve ? 'Adjustment approved and recorded.' : 'Adjustment rejected with a reason.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to review this adjustment.') }
    finally { setBusy(false) }
  }

  async function reviewTransaction(id: string, approve: boolean) {
    const note = approve ? '' : window.prompt('Reason for rejecting this transaction:') ?? ''
    if (!approve && note.trim().length < 3) return
    if (approve && !window.confirm('Post this transaction? Posted expenses reduce the available budget.')) return
    setBusy(true); setError(''); setMessage('')
    try {
      await reviewFinancialTransaction(id, approve, note); await refresh()
      setMessage(approve ? 'Transaction posted to the financial ledger.' : 'Transaction rejected with a recorded reason.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to review this transaction.') }
    finally { setBusy(false) }
  }

  async function voidTransaction(id: string) {
    const reason = window.prompt('Explain why this posted transaction must be voided:')
    if (!reason?.trim() || reason.trim().length < 3) return
    if (!window.confirm('Void this posted transaction? Its original amount and audit history will be preserved.')) return
    setBusy(true); setError(''); setMessage('')
    try { await voidFinancialTransaction(id, reason.trim()); await refresh(); setMessage('Transaction voided with an audited reason.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to void this transaction.') }
    finally { setBusy(false) }
  }

  async function attachReceipt(transactionId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const file = (form.elements.namedItem('receipt') as HTMLInputElement | null)?.files?.[0]
    if (!file || !allowedReceiptTypes.has(file.type) || file.size < 1 || file.size > receiptLimitBytes) {
      setError('Choose a PDF, JPEG, or PNG receipt smaller than 10 MB.')
      return
    }
    setBusy(true); setError(''); setMessage('')
    try {
      await uploadFinancialReceipt(transactionId, file)
      await refresh(); form.reset(); setMessage('Receipt uploaded to private financial records.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to upload this receipt.') }
    finally { setBusy(false) }
  }

  async function openReceipt(path: string) {
    setError('')
    try {
      const url = await createFinancialReceiptDownloadUrl(path)
      const link = document.createElement('a')
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to open this receipt.') }
  }

  async function exportFinanceReport() {
    if (!reportFrom || !reportTo || reportTo < reportFrom) { setError('Choose a valid report date range.'); return }
      const transactionRows = (transactions.data ?? []).filter((item) => item.transaction_date >= reportFrom && item.transaction_date <= reportTo)
      const byId = new Map(transactionRows.map((item) => [item.id, item]))
      const adjustmentRows = (adjustments.data ?? []).filter((item) => byId.has(item.transaction_id))
      const rowCount = transactionRows.length + adjustmentRows.length
    setBusy(true); setError(''); setMessage('')
    try {
      await recordFinanceReportExport(tenantId, reportFrom, reportTo, rowCount)
      const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
      const csv = [
        ['Date', 'Budget', 'Type', 'Category', 'Description', 'Amount PHP', 'Status', 'Submitted by', 'Reviewed by', 'Review note', 'Void reason'],
        ...transactionRows.map((item) => [item.transaction_date, item.budget?.name ?? '', item.transaction_type, item.category,
          item.description, Number(item.amount).toFixed(2), item.status, item.submitted_by, item.reviewed_by ?? '',
          item.review_note ?? '', item.void_reason ?? '']),
        ...adjustmentRows.map((adjustment) => { const item = byId.get(adjustment.transaction_id)!; return [item.transaction_date,
          item.budget?.name ?? '', `${item.transaction_type} adjustment`, item.category, `${item.description} (adjustment: ${adjustment.reason})`,
          Number(adjustment.amount_change).toFixed(2), adjustment.status, adjustment.requested_by, adjustment.reviewed_by ?? '',
          adjustment.review_note ?? '', ''] }),
      ].map((row) => row.map(quote).join(',')).join('\r\n')
      const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a'); link.href = url; link.download = `kabalikat-finance-${reportFrom}-to-${reportTo}.csv`; link.click()
      URL.revokeObjectURL(url)
      setMessage(`Finance report exported. ${rowCount} transaction and adjustment rows were included and the export was logged.`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to export the finance report.') }
    finally { setBusy(false) }
  }

  const approvedBudgets = budgets.data?.filter((budget) => budget.status === 'approved') ?? []
  const postedExpenses = (budgetId: string) => (transactions.data ?? []).filter((item) => item.budget_id === budgetId && item.transaction_type === 'expense' && item.status === 'posted').reduce((sum, item) => {
    const approvedChange = (adjustments.data ?? []).filter((adjustment) => adjustment.transaction_id === item.id && adjustment.status === 'approved').reduce((total, adjustment) => total + Number(adjustment.amount_change), 0)
    return sum + Number(item.amount) + approvedChange
  }, 0)

  return <section className="operation-page">
    <PageHeading title="Budgets & finance" description="Submit annual budgets and financial entries with separate review and approval controls.">
      {canManage.data && <><button className="button outline" onClick={() => setBudgetForm((open) => !open)}>New budget</button><button className="button primary" disabled={!approvedBudgets.length} onClick={() => setTransactionForm((open) => !open)}><ReceiptText size={16} />Add transaction</button></>}
    </PageHeading>
    {message && <div className="ops-success"><CheckCircle2 size={16} />{message}</div>}{error && <ErrorNotice message={error} />}
    {!canRead.isPending && !canRead.data && <div className="ops-panel archive-access"><ShieldCheck size={20} /><div><strong>Financial records are restricted</strong><p>Your current role cannot read this barangay’s budgets or transactions.</p></div></div>}
    {canRead.isPending && <LoadingNotice />}
    {canRead.data && <>
      <section className="ops-panel finance-report" aria-labelledby="finance-report-title">
        <div><h2 id="finance-report-title">Financial report</h2><p>Export transactions for a date range. Each export is recorded for audit.</p></div>
        <label>From<input type="date" value={reportFrom} max={reportTo} onChange={(event) => setReportFrom(event.target.value)} /></label>
        <label>To<input type="date" value={reportTo} min={reportFrom} onChange={(event) => setReportTo(event.target.value)} /></label>
        <button className="button outline" disabled={busy || transactions.isPending || adjustments.isPending || Boolean(transactions.error || adjustments.error)} onClick={() => void exportFinanceReport()}><Download size={16} />Export CSV</button>
        <small>Includes transaction status, reviewer notes, and void reasons for the selected dates.</small>
      </section>
      {budgetForm && canManage.data && <form className="ops-panel ops-form finance-form" onSubmit={(event) => void submitBudget(event)}>
        <div className="ops-panel-heading"><div><h2>Submit an annual budget</h2><p>A different authorized reviewer must approve it before transactions can use it.</p></div><CircleDollarSign size={18} /></div>
        <div className="ops-form-grid"><label>Fiscal year<input name="fiscalYear" type="number" min="2000" max="2200" defaultValue={new Date().getFullYear()} required /></label><label>Budget name<input name="name" minLength={3} maxLength={120} placeholder="General operations" required /></label><label>Approved amount (PHP)<input name="amount" type="number" min="0.01" step="0.01" required /></label></div>
        <div className="ops-form-actions"><button className="button primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit budget'}</button></div>
      </form>}
      {canManage.data && !approvedBudgets.length && !transactionForm && <p className="finance-next-step">Approve an annual budget before submitting financial entries.</p>}
      {transactionForm && canManage.data && <form className="ops-panel ops-form finance-form" onSubmit={(event) => void submitTransaction(event)}>
        <div className="ops-panel-heading"><div><h2>Submit a financial transaction</h2><p>Entries are submitted for independent review and cannot be edited after submission.</p></div><ReceiptText size={18} /></div>
        <div className="ops-form-grid"><label>Approved budget<select name="budgetId" required defaultValue=""><option value="" disabled>Select budget</option>{approvedBudgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.fiscal_year} · {budget.name}</option>)}</select></label><label>Type<select name="type"><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Category<input name="category" maxLength={80} placeholder="Supplies" required /></label><label>Amount (PHP)<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Date<input name="date" type="date" defaultValue={localDate} required /></label><label className="span-two">Description<input name="description" minLength={3} maxLength={1000} required /></label></div>
        <div className="ops-form-actions"><button className="button primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit for review'}</button></div>
      </form>}
      <div className="ops-section-title"><h2>Annual budgets</h2><p>Expenses are capped at the approved amount. Posted transactions remain in the audit history.</p></div>
      {budgets.isPending ? <LoadingNotice /> : budgets.error ? <ErrorNotice message={budgets.error.message} /> : budgets.data?.length ? <div className="finance-budget-list">{budgets.data.map((budget) => {
        const spent = postedExpenses(budget.id)
        return <article className="ops-panel finance-budget" key={budget.id}>
          <div className="finance-budget-head"><div><small>FY {budget.fiscal_year}</small><h3>{budget.name}</h3></div><StatusPill status={budget.status} /></div>
          <div className="finance-budget-amount"><strong>{currency.format(Number(budget.amount))}</strong><span>Approved budget</span></div>
          {budget.status === 'approved' && <div className="finance-budget-usage"><div><span>Posted expenses</span><strong>{currency.format(spent)}</strong></div><div className="finance-budget-track"><span style={{ width: `${Math.min(100, spent / Number(budget.amount) * 100)}%` }} /></div><small>{currency.format(Math.max(0, Number(budget.amount) - spent))} remaining</small></div>}
          {amendments.data?.filter((amendment) => amendment.budget_id === budget.id).map((amendment) => <div className="finance-amendment" key={amendment.id}><div><StatusPill status={amendment.status} /><strong>Requested amount: {currency.format(Number(amendment.requested_amount))}</strong></div><p>{amendment.reason}</p>{amendment.review_note && <small>Review: {amendment.review_note}</small>}{canApprove.data && amendment.status === 'pending' && amendment.requested_by !== user?.id && <div className="finance-review-actions"><button className="button outline" disabled={busy} onClick={() => void reviewAmendment(amendment.id, false)}>Reject</button><button className="button primary" disabled={busy} onClick={() => void reviewAmendment(amendment.id, true)}>Approve change</button></div>}</div>)}
          {canManage.data && budget.status === 'approved' && !amendments.data?.some((amendment) => amendment.budget_id === budget.id && amendment.status === 'pending') && <button className="button outline" disabled={busy} onClick={() => setAmendmentBudget(amendmentBudget === budget.id ? '' : budget.id)}>Request amount change</button>}
          {amendmentBudget === budget.id && <form className="finance-amendment-form" onSubmit={(event) => void submitAmendment(budget.id, event)}><label>Revised amount (PHP)<input name="amount" type="number" min="0.01" max="999999999999.99" step="0.01" defaultValue={budget.amount} required /></label><label>Reason<textarea name="reason" minLength={3} maxLength={1000} required /></label><button className="button primary" disabled={busy}>Submit for approval</button></form>}
          {canApprove.data && budget.status === 'draft' && budget.created_by !== user?.id && <button className="button primary" disabled={busy} onClick={() => void approveBudget(budget.id)}>Approve budget</button>}
          {budget.status === 'draft' && <p className="field-hint">Awaiting independent review. Created {formatDateTime(budget.created_at)}.</p>}
        </article>
      })}</div> : <EmptyNotice title="No budgets submitted" detail="Annual budgets submitted by your Treasurer will appear here." />}
      <div className="ops-section-title"><h2>Financial entries</h2><p>Only approved transactions count toward posted expenses.</p></div>
      {transactions.isPending ? <LoadingNotice /> : transactions.error ? <ErrorNotice message={transactions.error.message} /> : transactions.data?.length ? <div className="ops-panel finance-transaction-list">{transactions.data.map((item) => <article className="finance-transaction" key={item.id}>
        <div className="finance-transaction-main"><div><strong>{item.description}</strong><p>{item.category} · {item.budget?.name ?? 'Budget'} · {new Date(`${item.transaction_date}T00:00:00`).toLocaleDateString()}</p></div><div className="finance-transaction-amount"><strong className={item.transaction_type === 'income' ? 'finance-income' : ''}>{item.transaction_type === 'expense' ? '−' : '+'}{currency.format(Number(item.amount))}</strong><StatusPill status={item.status} /></div></div>
        {item.review_note && <p className="finance-review-note">Review note: {item.review_note}</p>}
        {item.void_reason && <p className="finance-review-note">Voided {item.voided_at ? formatDateTime(item.voided_at) : ''}: {item.void_reason}</p>}
        {adjustments.error && <ErrorNotice message={adjustments.error.message} />}
        {adjustments.data?.filter((adjustment) => adjustment.transaction_id === item.id).map((adjustment) => <div className="finance-adjustment" key={adjustment.id}><div><StatusPill status={adjustment.status} /><strong>{Number(adjustment.amount_change) > 0 ? '+' : '−'}{currency.format(Math.abs(Number(adjustment.amount_change)))}</strong></div><p>{adjustment.reason}</p>{adjustment.review_note && <small>Review: {adjustment.review_note}</small>}{canApprove.data && adjustment.status === 'pending' && adjustment.requested_by !== user?.id && <div className="finance-review-actions"><button className="button outline" disabled={busy} onClick={() => void reviewAdjustment(adjustment.id, false)}>Reject adjustment</button><button className="button primary" disabled={busy} onClick={() => void reviewAdjustment(adjustment.id, true)}>Approve adjustment</button></div>}</div>)}
        {canManage.data && item.status === 'posted' && !adjustments.data?.some((adjustment) => adjustment.transaction_id === item.id && adjustment.status === 'pending') && <button className="button outline finance-adjustment-toggle" disabled={busy} onClick={() => setAdjustmentTransaction(adjustmentTransaction === item.id ? '' : item.id)}>Request correction</button>}
        {adjustmentTransaction === item.id && <form className="finance-amendment-form" onSubmit={(event) => void submitAdjustment(item.id, event)}><label>Amount change (PHP)<input name="amountChange" type="number" min="-999999999999.99" max="999999999999.99" step="0.01" required /><span className="field-hint">Positive increases the entry; negative reduces it.</span></label><label>Reason<textarea name="reason" minLength={3} maxLength={1000} required /></label><button className="button primary" disabled={busy}>Submit correction for approval</button></form>}
        {receipts.error && <ErrorNotice message={receipts.error.message} />}
        {receipts.data?.filter((receipt) => receipt.transaction_id === item.id).map((receipt) => <button className="finance-receipt-link" key={receipt.id} onClick={() => void openReceipt(receipt.storage_path)}><ReceiptText size={14} />{receipt.file_name}<small>{(Number(receipt.file_size) / 1024).toFixed(0)} KB</small></button>)}
        {canManage.data && ['submitted', 'posted'].includes(item.status) && <form className="finance-receipt-upload" onSubmit={(event) => void attachReceipt(item.id, event)}>
          <label>Attach receipt <span className="field-hint">Optional · PDF, JPEG, PNG up to 10 MB</span><input name="receipt" type="file" accept="application/pdf,image/jpeg,image/png" required /></label>
          <button className="button outline" disabled={busy}><ReceiptText size={14} />Upload</button>
        </form>}
        {canApprove.data && item.status === 'submitted' && item.submitted_by !== user?.id && <div className="finance-review-actions"><button className="button outline" disabled={busy} onClick={() => void reviewTransaction(item.id, false)}>Reject</button><button className="button primary" disabled={busy} onClick={() => void reviewTransaction(item.id, true)}>Approve & post</button></div>}
        {canApprove.data && item.status === 'posted' && item.submitted_by !== user?.id && <div className="finance-review-actions"><button className="button outline danger-action" disabled={busy} onClick={() => void voidTransaction(item.id)}>Void with reason</button></div>}
      </article>)}</div> : <EmptyNotice title="No financial entries" detail="Entries submitted against approved budgets will appear here." />}
      <p className="archive-limit-note">Detailed reconciliation reports are a future addition. CSV exports include the selected transaction records and are logged for audit.</p>
    </>}
  </section>
}
