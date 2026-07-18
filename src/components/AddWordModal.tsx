import React, { useState } from 'react';
import { Button, Form, Modal, Stack } from 'react-bootstrap';

interface AddWordModalProps {
  show: boolean;
  onHide: () => void;
  onAddWord: (word: string, eng: string) => void;
}

const AddWordModal: React.FC<AddWordModalProps> = ({ show, onHide, onAddWord }) => {
  const [word, setWord] = useState('');
  const [eng, setEng] = useState('');

  const handleAdd = () => {
    if (!word.trim() || !eng.trim()) return;
    onAddWord(word.trim(), eng.trim());
    setWord('');
    setEng('');
    onHide();
  };

  const handleCancel = () => {
    setWord('');
    setEng('');
    onHide();
  };

  return (
    <Modal show={show} onHide={handleCancel} id='add-word-modal'>
      <Modal.Header closeButton>
        <Modal.Title>Add New Compound</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group controlId="compoundWord">
            <Form.Label>Kalob Word</Form.Label>
            <Form.Control 
              type="text" 
              placeholder="Enter word" 
              value={word} 
              onChange={(e) => setWord(e.target.value)} 
            />
          </Form.Group>
          <Form.Group controlId="compoundEng" className="mt-2">
            <Form.Label>English Meaning</Form.Label>
            <Form.Control 
              type="text" 
              placeholder="Enter meaning" 
              value={eng} 
              onChange={(e) => setEng(e.target.value)} 
            />
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Stack direction='horizontal' gap={3}>
          <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
          <Button variant="primary" onClick={handleAdd} disabled={!word.trim() || !eng.trim()}>Add</Button>
        </Stack>
      </Modal.Footer>
    </Modal>
  );
}

export default AddWordModal;
