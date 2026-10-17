import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { Expense } from '../models';
import { ApiService } from '../services/api.service';
import { PageState } from './ui';
import { IconComponent } from './icon.component';
import { PdfPreviewComponent } from './pdf-preview.component';
import { AiReceiptComponent } from './ai-receipt.component';
@Component({
  selector: 'app-receipt',
  imports: [IconComponent, PdfPreviewComponent, AiReceiptComponent],
  template: `<div class="receipt-controls">
    @if (expense.receipt_id) {
      <button
        class="text-button small-link"
        (click)="preview()"
        [attr.aria-label]="'Preview receipt ' + expense.expense_id"
      >
        <app-icon name="reports" />{{ expense.receipt_name }}
      </button>
      <small class="field-hint">{{ ((expense.receipt_size || 0) / 1024).toFixed(0) }} KB</small>
    } @else if (expense.receipt_url) {
      <a class="small-link" [href]="expense.receipt_url" target="_blank" rel="noopener noreferrer"
        >View receipt link</a
      >
    }
    @if (editable) {
      <input
        #fileInput
        type="file"
        hidden
        accept="image/png,image/jpeg,application/pdf"
        (change)="upload($event)"
        [attr.aria-label]="'Receipt file for expense ' + expense.expense_id"
      />
      <div class="receipt-buttons">
        @if (expense.receipt_id) {
          <button
            type="button"
            class="text-button small-link"
            (click)="scanOpen = true"
            [disabled]="busy"
            [attr.aria-label]="'Scan receipt ' + expense.expense_id"
          >
            Scan with AI
          </button>
        }
        <button
          class="text-button small-link"
          (click)="fileInput.click()"
          [disabled]="busy"
          [attr.aria-label]="
            (expense.receipt_id ? 'Replace receipt ' : 'Add receipt ') + expense.expense_id
          "
        >
          {{ busy ? 'Uploading…' : expense.receipt_id ? 'Replace file' : 'Add receipt' }}
        </button>
        @if (expense.receipt_id) {
          <button
            class="text-button danger"
            (click)="remove()"
            [disabled]="busy"
            [attr.aria-label]="'Remove receipt ' + expense.expense_id"
          >
            Remove
          </button>
        }
      </div>
    } @else if (!expense.receipt_id && !expense.receipt_url) {
      <span class="muted">—</span>
    }
    @if (error) {
      <small class="field-error receipt-error" role="alert">{{ error }}</small>
    }
    @if (scanOpen) {
      <app-ai-receipt
        [expense]="expense"
        (cancelled)="scanOpen = false"
        (saved)="scanOpen = false; changed.emit()"
      />
    }
    <dialog
      #viewer
      class="receipt-dialog"
      [attr.aria-labelledby]="'receipt-title-' + expense.expense_id"
      (close)="viewing = false"
    >
      <div class="form-heading">
        <div>
          <div class="eyebrow">YOUR RECEIPT</div>
          <h2 [id]="'receipt-title-' + expense.expense_id">{{ expense.receipt_name }}</h2>
        </div>
        <button class="icon-button" aria-label="Close receipt preview" (click)="viewer.close()">
          <app-icon name="close" />
        </button>
      </div>
      @if (viewing) {
        @if (expense.receipt_type === 'application/pdf') {
          <app-pdf-preview [url]="url" [name]="expense.receipt_name || 'Receipt'" />
        } @else {
          <img [src]="url" [alt]="expense.receipt_name || 'Receipt'" />
        }
      }
      <div class="form-actions">
        <a class="button secondary" [href]="url + '?download=1'" download
          ><app-icon name="download" />Download receipt</a
        >
        @if (expense.receipt_type !== 'application/pdf') {
          <a class="small-link" [href]="url" target="_blank" rel="noopener noreferrer"
            >Open in a new tab</a
          >
        }
      </div>
    </dialog>
  </div>`,
})
export class ReceiptComponent extends PageState {
  @Input({ required: true }) expense!: Expense;
  @Input() editable = true;
  @Output() changed = new EventEmitter<void>();
  @ViewChild('viewer') viewer!: ElementRef<HTMLDialogElement>;
  viewing = false;
  scanOpen = false;
  constructor(private api: ApiService) {
    super();
  }
  get url() {
    return '/api/expenses/' + Number(this.expense.expense_id) + '/receipt';
  }
  preview() {
    this.viewing = true;
    this.viewer.nativeElement.showModal();
  }
  upload(event: Event) {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    input.value = '';
    if (file.size > 5 * 1024 * 1024 || !/\.(png|jpe?g|pdf)$/i.test(file.name)) {
      this.error = 'Choose a PNG, JPEG or PDF no larger than 5 MB.';
      return;
    }
    this.run(
      this.api.uploadReceipt(this.expense.expense_id!, file),
      () => this.changed.emit(),
      'Receipt saved. Everything is in one place.',
    );
  }
  remove() {
    if (confirm('Remove the attached receipt? Saved report totals will remain unchanged.'))
      this.run(
        this.api.deleteReceipt(this.expense.expense_id!),
        () => this.changed.emit(),
        'Receipt removed.',
      );
  }
}
