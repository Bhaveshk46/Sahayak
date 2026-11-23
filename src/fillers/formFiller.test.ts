import { describe, it, expect, beforeEach } from 'vitest';
import { fillField, undoFieldFill } from './formFiller';
import { FormField } from '../types';

describe('M3 Filler Logic & Framework Event Bubbling', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('updates React-controlled input using native value setter and fires events', () => {
    // Simulate React controlled input: keeps internal state updated on input event
    document.body.innerHTML = `
      <form id="test_form">
        <label for="controlled_name">Full Name</label>
        <input type="text" id="controlled_name" name="full_name" value="" />
      </form>
    `;

    const input = document.getElementById('controlled_name') as HTMLInputElement;
    let reactState = '';

    // Attach React-like listener
    input.addEventListener('input', (e) => {
      reactState = (e.target as HTMLInputElement).value;
    });

    const field: FormField = {
      id: 'controlled_name',
      name: 'full_name',
      type: 'text',
      label: 'Full Name',
      labelSource: 'label-for',
      labelConfidence: 1,
      required: true,
      selector: '#controlled_name',
      isInsideIframe: false,
    };

    const res = fillField(field, 'Aditi Ramesh Sharma');
    expect(res.ok).toBe(true);
    expect(res.newValue).toBe('Aditi Ramesh Sharma');
    expect(input.value).toBe('Aditi Ramesh Sharma');
    // Verify React state received the value
    expect(reactState).toBe('Aditi Ramesh Sharma');
  });

  it('fills native select and fires change event', () => {
    document.body.innerHTML = `
      <select id="user_category" name="category">
        <option value="GENERAL">General</option>
        <option value="OBC">Other Backward Class (OBC)</option>
        <option value="SC">Scheduled Caste</option>
      </select>
    `;

    const select = document.getElementById('user_category') as HTMLSelectElement;
    let changeFired = false;
    select.addEventListener('change', () => {
      changeFired = true;
    });

    const field: FormField = {
      id: 'user_category',
      name: 'category',
      type: 'select',
      label: 'Category',
      labelSource: 'none',
      labelConfidence: 1,
      required: true,
      selector: '#user_category',
      isInsideIframe: false,
    };

    const res = fillField(field, 'OBC');
    expect(res.ok).toBe(true);
    expect(select.value).toBe('OBC');
    expect(changeFired).toBe(true);
  });

  it('fills radio button group correctly', () => {
    document.body.innerHTML = `
      <div>
        <label><input type="radio" name="notice" value="immediate" /> Immediate</label>
        <label><input type="radio" name="notice" value="30_days" /> 30 Days</label>
      </div>
    `;

    const field: FormField = {
      id: 'radiogroup_notice',
      name: 'notice',
      type: 'radio',
      label: 'Notice Period',
      labelSource: 'nearby-text',
      labelConfidence: 0.8,
      required: true,
      selector: 'input[name="notice"]',
      isInsideIframe: false,
    };

    const res = fillField(field, '30_days');
    expect(res.ok).toBe(true);

    const checked = document.querySelector('input[name="notice"]:checked') as HTMLInputElement;
    expect(checked).not.toBeNull();
    expect(checked.value).toBe('30_days');
  });

  it('opens and selects option in custom combobox dropdown', () => {
    document.body.innerHTML = `
      <div id="custom_scheme" role="combobox" data-formpilot-custom-dropdown="true">
        <button type="button" id="trigger_btn">Select Option</button>
        <ul role="listbox">
          <li role="option" data-value="merit">Post-Matric Merit Scheme</li>
          <li role="option" data-value="fellowship">Fellowship Scheme</li>
        </ul>
      </div>
    `;

    const field: FormField = {
      id: 'custom_scheme',
      name: 'custom_scheme',
      type: 'custom-select',
      label: 'Scheme',
      labelSource: 'none',
      labelConfidence: 1,
      required: true,
      selector: '#custom_scheme',
      isInsideIframe: false,
    };

    let selectedValue = '';
    const option = document.querySelector('[data-value="merit"]') as HTMLElement;
    option.addEventListener('click', () => {
      selectedValue = 'merit';
    });

    const res = fillField(field, 'merit');
    expect(res.ok).toBe(true);
    expect(selectedValue).toBe('merit');
  });

  it('refuses to fill CAPTCHA fields per Rule 2', () => {
    document.body.innerHTML = `
      <input type="checkbox" id="recaptcha_check" name="captcha_verified" />
    `;

    const field: FormField = {
      id: 'recaptcha_check',
      name: 'captcha_verified',
      type: 'checkbox',
      label: 'I am not a robot',
      labelSource: 'none',
      labelConfidence: 1,
      required: true,
      selector: '#recaptcha_check',
      isInsideIframe: false,
    };

    const res = fillField(field, 'true');
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('Rule 2');
    const checkbox = document.getElementById('recaptcha_check') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('supports undoing applied values', () => {
    document.body.innerHTML = `
      <input type="text" id="phone_field" name="phone" value="InitialValue" />
    `;

    const field: FormField = {
      id: 'phone_field',
      name: 'phone',
      type: 'text',
      label: 'Phone',
      labelSource: 'none',
      labelConfidence: 1,
      required: true,
      selector: '#phone_field',
      isInsideIframe: false,
    };

    const input = document.getElementById('phone_field') as HTMLInputElement;

    // 1. Fill field
    const res = fillField(field, '9876543210');
    expect(res.ok).toBe(true);
    expect(input.value).toBe('9876543210');
    expect(res.previousValue).toBe('InitialValue');

    // 2. Undo
    const undoSuccess = undoFieldFill({
      fieldId: field.id,
      selector: field.selector,
      isInsideIframe: field.isInsideIframe,
      previousValue: res.previousValue!,
      type: field.type,
    });

    expect(undoSuccess).toBe(true);
    expect(input.value).toBe('InitialValue');
  });

  it('re-resolves dynamic element re-created after initial scan', () => {
    // 1. Initial DOM representation
    document.body.innerHTML = `
      <div id="wrapper">
        <input type="text" id="legal_name" name="full_legal_name" value="" />
      </div>
    `;

    const initialField: FormField = {
      id: 'legal_name',
      name: 'full_legal_name',
      type: 'text',
      label: 'Full Legal Name',
      labelSource: 'label-for',
      labelConfidence: 1,
      required: true,
      selector: '#legal_name',
      isInsideIframe: false,
    };

    // 2. Simulate React component re-rendering/re-mounting (new DOM node replacing the old one)
    const wrapper = document.getElementById('wrapper')!;
    wrapper.innerHTML = `
      <input type="text" id="legal_name" name="full_legal_name" value="" class="mounted-by-react" />
    `;

    // 3. Fill must dynamically query the fresh element at fill time
    const res = fillField(initialField, 'Aditi Ramesh Sharma');
    expect(res.ok).toBe(true);
    expect(res.newValue).toBe('Aditi Ramesh Sharma');

    const freshInput = document.getElementById('legal_name') as HTMLInputElement;
    expect(freshInput.value).toBe('Aditi Ramesh Sharma');
    expect(freshInput.classList.contains('mounted-by-react')).toBe(true);
  });
});
