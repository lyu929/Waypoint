import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AiReceiptDraft, Expense } from '../models';
import { ApiService } from '../services/api.service';
import { AiConnection } from '../services/ai-connection.service';
import { PageState, categories } from './ui';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-ai-receipt',
  imports: [FormsModule, IconComponent],
  template: `<dialog
    #dialog
    class="receipt-dialog ai-receipt-dialog"
    [attr.aria-labelledby]="'ai-receipt-title-' + expense.expense_id"
    (cancel)="onCancel($event)"
    (close)="cancelled.emit()"
  >
    <div class="form-heading">
      <div>
        <div class="eyebrow">LESS TYPING. MORE EXPLORING.</div>
        <h2 [id]="'ai-receipt-title-' + expense.expense_id">Smart Receipt Scan</h2>
        <p>{{ expense.receipt_name }}</p>
      </div>
      <button
        class="icon-button"
        type="button"
        aria-label="Close receipt scan"
        (click)="dialog.close()"
        [disabled]="busy"
      >
        <app-icon name="close" />
      </button>
    </div>
    <p class="ai-disclosure">
      Scanning sends this receipt file to OpenAI to read its printed details. Check the amount, date
      and currency before applying changes.
    </p>
    @if (!connection.checking() && !connection.available()) {
      <p class="ai-note">
        AI is not connected yet. Ask the workspace owner to enable it. You can edit expenses
        manually.
      </p>
    }
    @if (error) {
      <p class="error" role="alert">{{ error }}</p>
    }
    @if (!draft) {
      <div class="ai-scan-intro">
        <span class="ai-symbol"><app-icon name="reports" /></span>
        <h3>Let your receipt do the typing.</h3>
        <p>
          We'll suggest a merchant, date, amount and category. Your saved expense stays unchanged
          until you confirm.
        </p>
      </div>
      <div class="form-actions">
        <button
          class="primary"
          type="button"
          (click)="scan()"
          [disabled]="busy || !connection.available()"
        >
          {{ action === 'scan' ? 'Reading your receipt…' : 'Scan receipt' }}</button
        ><button class="secondary" type="button" (click)="dialog.close()" [disabled]="busy">
          Cancel
        </button>
      </div>
    } @else {
      <form (ngSubmit)="save(receiptForm.valid)" #receiptForm="ngForm">
        <span class="ai-badge">DRAFT · REVIEW BEFORE APPLYING</span>
        @if (draft.merchant) {
          <p class="ai-merchant">{{ draft.merchant }}</p>
        }
        @for (warning of draft.warnings; track $index) {
          <p class="ai-note">{{ warning }}</p>
        }
        @if (draft.currency !== 'USD') {
          <p class="ai-note">
            This workspace records USD only. Confirm the printed currency. Foreign-currency receipts
            must be converted and entered manually.
          </p>
        }
        <fieldset [disabled]="busy" class="ai-card-fields">
          <div class="form-grid">
            <label
              >Amount ({{ draft.currency || 'currency unconfirmed' }})<input
                name="scanAmount"
                type="number"
                [(ngModel)]="draft.amount"
                required
                min="0.01"
                max="99999999.99"
                step="0.01" /></label
            ><label
              >Receipt currency<input
                name="scanCurrency"
                [(ngModel)]="draft.currency"
                required
                maxlength="3"
                pattern="USD"
                placeholder="USD"
            /></label>
          </div>
          <div class="form-grid">
            <label
              >Expense date<input
                name="scanDate"
                type="date"
                [(ngModel)]="draft.expense_date"
                required /></label
            ><label
              >Category<select name="scanCategory" [(ngModel)]="draft.category">
                @for (category of categories; track category.value) {
                  <option [value]="category.value">{{ category.label }}</option>
                }
              </select></label
            >
          </div>
          <label
            >Description<input
              name="scanDescription"
              [(ngModel)]="draft.description"
              maxlength="200"
          /></label>
        </fieldset>
        <div class="ai-existing">
          Current saved expense: <strong>{{ money(expense.amount) }}</strong> ·
          {{ date(expense.expense_date) }} · {{ categoryLabel(expense.category) }}
        </div>
        <p class="field-hint">
          Applying replaces this expense's amount, date, category and description. Its receipt and
          saved report snapshots are preserved.
        </p>
        <div class="form-actions">
          <button
            class="primary"
            type="submit"
            [disabled]="busy || !receiptForm.valid || draft.currency !== 'USD'"
          >
            {{ action === 'save' ? 'Applying changes…' : 'Apply reviewed details' }}</button
          ><button
            class="secondary"
            type="button"
            (click)="scan()"
            [disabled]="busy || !connection.available()"
          >
            Scan again</button
          ><button class="secondary" type="button" (click)="dialog.close()" [disabled]="busy">
            Cancel
          </button>
        </div>
      </form>
    }
  </dialog>`,
})
export class AiReceiptComponent extends PageState implements AfterViewInit {
  @Input({ required: true }) expense!: Expense;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();
  @ViewChild('dialog') dialog!: ElementRef<HTMLDialogElement>;
  draft?: AiReceiptDraft;
  action = '';
  categories = categories;
  constructor(
    private api: ApiService,
    public connection: AiConnection,
  ) {
    super();
  }
  ngAfterViewInit() {
    this.dialog.nativeElement.showModal();
  }
  onCancel(event: Event) {
    if (this.busy) event.preventDefault();
  }
  scan() {
    if (this.busy || !this.connection.available()) return;
    this.action = 'scan';
    this.run(
      this.api.scanReceipt(this.expense.expense_id!).pipe(finalize(() => (this.action = ''))),
      (draft) => (this.draft = draft),
    );
  }
  save(valid: boolean | null) {
    if (!valid || !this.draft || this.busy) return;
    this.action = 'save';
    this.run(
      this.api
        .applyReceiptDraft(this.expense.expense_id!, this.draft)
        .pipe(finalize(() => (this.action = ''))),
      () => {
        this.saved.emit();
      },
      'Reviewed receipt details applied.',
    );
  }
}
