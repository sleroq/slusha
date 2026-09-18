import { Button } from './Button.tsx';

export function ErrorNotice(props: { message: string; retry?: () => void }) {
    return (
        <div class='error-notice' role='alert'>
            <span>{props.message}</span>
            {props.retry && <Button onClick={props.retry}>Retry</Button>}
        </div>
    );
}
